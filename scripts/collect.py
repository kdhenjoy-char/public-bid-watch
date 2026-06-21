"""
공공 공고 수집 스크립트
- 나라장터(조달청) 입찰공고정보서비스 (물품/용역/공사)
- 기업마당(중기부) 지원사업정보 API

매일 GitHub Actions cron으로 실행되어 data/announcements.json 을 갱신합니다.

필요한 환경변수 (GitHub repo Secrets 로 등록):
  G2B_API_KEY      - data.go.kr 에서 발급받은 "조달청_나라장터 입찰공고정보서비스" 인증키 (Decoding 키)
  BIZINFO_API_KEY  - data.go.kr 에서 발급받은 "기업마당 지원사업정보 API" 인증키 (crtfcKey)
"""

import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCENARIOS_PATH = os.path.join(ROOT, "scenarios.json")
OUTPUT_PATH = os.path.join(ROOT, "data", "announcements.json")

G2B_API_KEY = os.environ.get("G2B_API_KEY", "")
BIZINFO_API_KEY = os.environ.get("BIZINFO_API_KEY", "")

# 며칠 치 공고를 수집할지 (최초 실행시 더 길게, 이후엔 cron 주기에 맞춰 짧게 가능)
LOOKBACK_DAYS = int(os.environ.get("LOOKBACK_DAYS", "14"))

REQUEST_TIMEOUT = 20
SLEEP_BETWEEN_CALLS = 0.3


def http_get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
        body = resp.read().decode("utf-8", errors="replace")
    return json.loads(body)


def load_scenarios():
    with open(SCENARIOS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)["scenarios"]


def match_scenarios(title, scenarios):
    """공고 제목이 어떤 시나리오의 키워드와 매칭되는지 반환"""
    matched = []
    title_l = (title or "").lower()
    for sc in scenarios:
        for kw in sc["keywords"]:
            if kw.lower() in title_l:
                matched.append(sc["id"])
                break
    return matched


# ---------------------------------------------------------------------------
# 나라장터 (조달청) 수집
# ---------------------------------------------------------------------------
# 업무구분별로 오퍼레이션이 분리되어 있음: 물품 / 용역 / 공사
G2B_OPERATIONS = {
    "물품": "getBidPblancListInfoThng",
    "용역": "getBidPblancListInfoServc",
    "공사": "getBidPblancListInfoCnstwk",
}
G2B_BASE = "https://apis.data.go.kr/1230000/ad/BidPublicInfoService"


def fetch_g2b(scenarios):
    if not G2B_API_KEY:
        print("[g2b] G2B_API_KEY 미설정 - 건너뜀", file=sys.stderr)
        return []

    end = datetime.now()
    begin = end - timedelta(days=LOOKBACK_DAYS)
    bgn_str = begin.strftime("%Y%m%d") + "0000"
    end_str = end.strftime("%Y%m%d") + "2359"

    results = []
    for category, operation in G2B_OPERATIONS.items():
        page = 1
        while True:
            params = {
                "type": "json",
                "inqryDiv": "1",  # 1: 공고게시일시 기준
                "inqryBgnDt": bgn_str,
                "inqryEndDt": end_str,
                "pageNo": str(page),
                "numOfRows": "999",
            }
            # ServiceKey는 data.go.kr에서 발급된 상태 그대로(Decoding 키, 특수문자 포함)
            # URL에 붙여야 하므로 urlencode 대상에서 제외하고 별도로 결합한다.
            # (이중 인코딩 시 502/500 에러가 발생할 수 있음)
            query = urllib.parse.urlencode(params)
            url = f"{G2B_BASE}/{operation}?ServiceKey={G2B_API_KEY}&{query}"
            try:
                data = http_get_json(url)
            except Exception as e:
                print(f"[g2b][{category}] 요청 실패: {e}", file=sys.stderr)
                # 디버깅을 위해 응답 본문 일부 출력 시도
                try:
                    err_body = e.read().decode("utf-8", errors="replace")[:500]
                    print(f"[g2b][{category}] 응답 본문: {err_body}", file=sys.stderr)
                except Exception:
                    pass
                break

            body = data.get("response", {}).get("body", {})
            items = body.get("items", [])
            if isinstance(items, dict):
                items = [items]
            if not items:
                break

            for it in items:
                title = it.get("bidNtceNm", "")
                matched = match_scenarios(title, scenarios)
                if not matched:
                    continue
                results.append({
                    "source": "나라장터",
                    "category": category,
                    "scenario_ids": matched,
                    "title": title,
                    "org": it.get("ntceInsttNm", ""),
                    "demand_org": it.get("dmndInsttNm", ""),
                    "notice_no": it.get("bidNtceNo", ""),
                    "notice_date": it.get("bidNtceDt", ""),
                    "deadline": it.get("bidClseDt", ""),
                    "url": it.get("bidNtceDtlUrl", "") or it.get("bidNtceUrl", ""),
                    "budget": it.get("asignBdgtAmt", ""),
                })

            total_count = int(body.get("totalCount", 0) or 0)
            if page * 999 >= total_count:
                break
            page += 1
            time.sleep(SLEEP_BETWEEN_CALLS)

    return results


# ---------------------------------------------------------------------------
# 기업마당 (중기부) 수집
# ---------------------------------------------------------------------------
BIZINFO_URL = "https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do"


def fetch_bizinfo(scenarios):
    if not BIZINFO_API_KEY:
        print("[bizinfo] BIZINFO_API_KEY 미설정 - 건너뜀", file=sys.stderr)
        return []

    results = []
    page = 1
    page_unit = 100
    while True:
        params = {
            "crtfcKey": BIZINFO_API_KEY,
            "dataType": "json",
            "pageUnit": str(page_unit),
            "pageIndex": str(page),
        }
        url = BIZINFO_URL + "?" + urllib.parse.urlencode(params)
        try:
            data = http_get_json(url)
        except Exception as e:
            print(f"[bizinfo] 요청 실패: {e}", file=sys.stderr)
            break

        # 응답 구조: {"jsonArray": [...]} 형태로 알려져 있음. 변경될 수 있어 방어적으로 처리.
        items = data.get("jsonArray") or data.get("items") or []
        if not items:
            break

        for it in items:
            title = it.get("pblancNm", "")
            matched = match_scenarios(title, scenarios)
            if not matched:
                continue
            results.append({
                "source": "기업마당",
                "category": it.get("hashtags", ""),
                "scenario_ids": matched,
                "title": title,
                "org": it.get("jrsdInsttNm", ""),
                "demand_org": it.get("excInsttNm", ""),
                "notice_no": it.get("pblancId", ""),
                "notice_date": it.get("rceptEngDt", "") or it.get("creatPnttm", ""),
                "deadline": it.get("reqstEndDe", ""),
                "url": it.get("pblancUrl", ""),
                "budget": "",
            })

        if len(items) < page_unit:
            break
        page += 1
        time.sleep(SLEEP_BETWEEN_CALLS)

    return results


# ---------------------------------------------------------------------------
# IRIS / NRF / IITP - 공식 API 부재. 1단계에서는 자리만 마련해둠 (Step 4에서 구현)
# ---------------------------------------------------------------------------
def fetch_iris(scenarios):
    return []


def fetch_nrf(scenarios):
    return []


def fetch_iitp(scenarios):
    return []


def main():
    scenarios = load_scenarios()

    all_items = []
    all_items += fetch_g2b(scenarios)
    all_items += fetch_bizinfo(scenarios)
    all_items += fetch_iris(scenarios)
    all_items += fetch_nrf(scenarios)
    all_items += fetch_iitp(scenarios)

    # notice_no 기준 중복 제거
    seen = set()
    deduped = []
    for it in all_items:
        key = (it["source"], it.get("notice_no") or it["title"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(it)

    output = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "scenarios": scenarios,
        "count": len(deduped),
        "items": deduped,
    }

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"수집 완료: {len(deduped)}건 -> {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
