# 공공 공고 트래커 (나라장터 · 기업마당)

시나리오별 키워드로 나라장터/기업마당(추후 IRIS/NRF/IITP 확장) 공고를 매일 자동 수집하여
정적 대시보드로 보여주는 프로젝트입니다.

## 1. 구조

```
public-bid-watch/
├── .github/workflows/collect.yml   # 매일 자동 수집 GitHub Actions
├── scripts/collect.py              # 나라장터/기업마당 API 수집·필터링 스크립트
├── scenarios.json                  # 시나리오(키워드 세트) 정의
├── data/announcements.json         # 수집 결과 (Actions가 자동 갱신)
├── index.html / app.js / style.css # 정적 대시보드 (GitHub Pages)
└── README.md
```

## 2. GitHub 저장소 생성 및 푸시

1. GitHub에서 새 저장소 생성 (예: `public-bid-watch`)
2. 이 폴더 전체를 푸시:
   ```bash
   git init
   git add .
   git commit -m "init: public bid watch"
   git branch -M main
   git remote add origin https://github.com/<your-id>/public-bid-watch.git
   git push -u origin main
   ```

## 3. API 키 등록 (GitHub Secrets)

저장소 → **Settings → Secrets and variables → Actions → New repository secret**

| Secret 이름 | 값 |
|---|---|
| `G2B_API_KEY` | data.go.kr에서 발급받은 조달청 입찰공고정보서비스 인증키 (Decoding 키) |
| `BIZINFO_API_KEY` | data.go.kr에서 발급받은 기업마당 지원사업정보 API 인증키 (crtfcKey) |

⚠️ 코드에는 키를 절대 직접 넣지 마세요. `scripts/collect.py`는 환경변수(`os.environ`)로만 읽습니다.

## 4. GitHub Pages 활성화

저장소 → **Settings → Pages**
- Source: `Deploy from a branch`
- Branch: `main` / `/ (root)`

배포 후 `https://<your-id>.github.io/public-bid-watch/` 로 접속 가능합니다.
시나리오 직접 지정: `?scenario=smart-factory`, `?scenario=gen-ai`, `?scenario=marine-robot`

## 5. 수집 스크립트 동작 확인 (로컬 테스트)

```bash
export G2B_API_KEY="발급받은_키"
export BIZINFO_API_KEY="발급받은_키"
python scripts/collect.py
```

`data/announcements.json`이 갱신되는지 확인하세요.

## 6. 자동 실행 주기

`.github/workflows/collect.yml`에서 cron 설정 (기본: 매일 한국시간 08:00).
수동 실행은 저장소 → Actions → "Collect bid announcements" → **Run workflow**.

## 7. 알려진 제약 / 다음 단계 (Step 4 이후)

- **IRIS / NRF / IITP**: 공식 Open API가 없어 현재는 수집 로직이 비어 있습니다(`fetch_iris`, `fetch_nrf`, `fetch_iitp`).
  사이트 구조를 조사해 스크래핑 또는 비공식 엔드포인트 연동이 필요합니다. (Step 4)
- **나라장터 API 필드명**: `bidNtceNm`, `ntceInsttNm` 등은 일반적으로 통용되는 필드명 기준으로 작성했습니다.
  최초 실행 후 응답 JSON 구조가 다르면 `scripts/collect.py`의 `fetch_g2b` 매핑 부분만 조정하면 됩니다.
- **기업마당 API 응답 구조**: `jsonArray` 키 기준으로 작성했으나, 실제 응답을 한 번 확인 후 필드명을 맞춰야 합니다.
- **사업계획서 초안 생성 기능 (Step 6)**: 현재 대시보드에서 공고 클릭 시 모달이 뜨지만 기능은 비활성 상태입니다.
  이 기능은 별도 백엔드(서버리스 함수)에서 Claude API를 호출하는 구조로 다음 단계에 추가할 예정입니다.

## 8. 시나리오 추가/수정

`scenarios.json`의 `keywords` 배열만 수정하면 바로 반영됩니다 (코드 수정 불필요).
