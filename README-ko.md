<img src="docs/assets/akela-mark.svg" alt="Akela" width="56" height="56">

# Akela

**A deterministic compiler over rectified context — 정제된 컨텍스트의 결정론적 컴파일러.**

**[웹사이트](https://timothyhan.github.io/akela/ko/)** · **English: [README.md](README.md)**

[![tests](https://github.com/TimothyHan/akela/actions/workflows/ci.yml/badge.svg)](https://github.com/TimothyHan/akela/actions/workflows/ci.yml) [![npm](https://img.shields.io/npm/v/akela)](https://www.npmjs.com/package/akela) ![node](https://img.shields.io/badge/node-%E2%89%A518-brightgreen) ![deps](https://img.shields.io/badge/dependencies-0-brightgreen)

> 이 문서는 [README.md](README.md)(영어)의 한국어판입니다. 내용이 다를 경우 영어판이 기준입니다.

Akela는 AI 에이전트를 위한 **컨텍스트 컴파일러**입니다. 이미 갖고 있는 마크다운 지식 베이스 — 위키, 레퍼런스 폴더, 팀 플레이북 — 를 작업(task)마다 범위가 한정된 재현 가능한 컨텍스트 슬라이스로 컴파일하고, 에이전트 실행에서 나온 증거로 그 지식의 변화를 관리합니다.

세 가지 도구, 세 가지 다른 질문:

> **RAG**의 질문: *어떤 정보가 관련 있어 보이는가?*
> **에이전트 메모리**의 질문: *에이전트가 무엇을 기억해야 하는가?*
> **Akela**의 질문: *이 작업에서 에이전트가 사용하도록 허가된 지식은 무엇이고, 그 지식을 바꿀 근거가 되는 증거는 무엇인가?*

이미 RAG를 쓰고 있다면 그대로 두세요. 검색 결과는 다른 지식 소스와 똑같이 추적되는 소스로 슬라이스에 들어옵니다.

## 세 가지 기본 요소

Akela의 모든 것은 이 셋 중 하나의 구현입니다:

**1 · 지식(Knowledge)** — 팀이 믿는 것. 여러분이 소유한 마크다운입니다. 위키 섹션, 제안된 학습(learning), 검색된 노트. Akela는 이것을 색인할 뿐, 절대 수정하지 않습니다.

**2 · 컴파일(Compilation)** — *이번* 작업에서 에이전트가 알아도 되는 것. 결정론적 집합 연산입니다(임베딩 없음, LLM 단계 없음). 같은 입력이면 언제나 바이트 단위로 같은 슬라이스가 나옵니다. 모든 컴파일은 매니페스트로 시작합니다 — 무엇이 포함됐고 **무엇이 어떤 이유로 제외됐는지**까지 기록하는 감사 추적입니다. 실제 매니페스트:

```
---
manifest: 1
run: refund-T-4821-15816c
activity: refund
compiler: akela 0.1.4   domain: default   scoring: off
sources:
  - id: WIKI-refunds#approval   tier: must   lines: 2
  - id: LRN-20260829-01   tier: lrn   lines: 3
  - id: WIKI-refunds#method   tier: should   lines: 2
dropped:
  - id: WIKI-shipping#carriers   reason: general-scope
---
```

"낡은 규칙이 에이전트 눈앞에 있었는가?"라는 질문에 추측이 아니라 파일로 답할 수 있습니다.

**3 · 증거(Evidence)** — 에이전트가 그 지식을 사용했을 때 실제로 일어난 일. 에이전트는 자신이 *적용한(applied)* 규칙과 결과가 *반박한(contradicted)* 규칙을 보고하고, 추가 전용(append-only) 콘텐츠 해시 로그가 규칙별 기록을 쌓아 갑니다. 계속 실패하는 규칙은 **반증(falsified)** 플래그가 붙고 — 어떤 메모리 도구도 제공하지 않는 메커니즘입니다 — 컨텍스트에서 증명 가능하게 사라집니다. 계속 검증되는 규칙은 승격 후보가 됩니다. 큐레이터(여러분, 또는 여러분이 편집을 검토하는 에이전트)가 수치를 읽고 결정합니다. 지식 베이스가 몰래 바뀌는 일은 없습니다.

전체 용어 — scope, tier, learning, fingerprint, 도메인 팩 — 는 [docs](docs/)에 있으며, 모두 이 세 기본 요소가 작업복을 입은 것뿐입니다.

QA 자동화 도구 안에서 태어나 실제 업무에서 먼저 검증된 뒤, 어떤 도메인이든 — 지원, 운영, 리서치, QA — 같은 루프를 돌릴 수 있도록 추출·일반화되었습니다. 그 도구([QABuddy](https://github.com/timothyhan/QABuddy))는 이제 Akela의 레퍼런스 소비자로서, 자체 테스트 스위트 전체를 CI에서 이 엔진에 대해 실행합니다. 의존성 0, Node ≥ 18.

## 약속이 아니라 측정

모든 주장은 실험을 거쳤습니다. 격리된 세 에이전트 — 작업을 수행하는 트레이니, `akela stats`를 읽는 큐레이터, 세계가 바뀔 때 소스를 갱신하는 무언의 스크립트 — 와 루프 밖의 결정론적 채점기를 여러 조건과 시드에서 돌렸고, 모든 결과는 아카이브되어 있습니다. 실험 프로그램 전체(하네스, 태스크 베드, 결과 아카이브, 발견)는 별도로 공개할 예정입니다.

구매자의 표 — 파일 / 관리되는 위키 / RAG, 각각 **Akela 없이 → Akela와 함께**. 같은 베드, 같은 모델, 같은 채점기, 규칙 변경 이후:

| | 파일 | 관리되는 위키 | RAG |
|---|---|---|---|
| 정확도 | 0.53 → 0.51 | 0.96 → 0.90 | 0.89 → 0.81 |
| 컨텍스트 안의 낡은 규칙 | 26/26 → 21/26 | **17/26 → 2/26** | 23/26 → 21/26 |
| 작업당 컨텍스트 토큰 | 35,690 → **139** | 35,773 → **138** | 35,772 → **201** |
| 정답 1개당 비용 | $2.37 → **$1.48** | $1.17 → **$0.81** | $1.45 → **$1.02** |

데이터가 강제하는 순서 그대로, 정직하게:

- **유지보수가 도구를 이깁니다.** 표에서 가장 큰 도약은 방치된 파일 → 관리되는 위키(0.53 → 0.96)로, 누군가 소스를 최신으로 유지한 것만으로 생긴 차이입니다. Akela의 역할은 그 유지보수를 대체하는 것이 아니라, 감당 가능하고 증명 가능하게 만드는 것입니다.
- **순수 정확도만 보면 전부 쏟아붓기가 모든 쌍에서 근소하게 이깁니다** — 작업당 353k 토큰까지 확장해도 평평했습니다. 오늘의 정확도만 측정하고 토큰이 공짜라면, 이 도구는 필요 없습니다.
- **구조적인 것은 전부, 모든 쌍에서 Akela가 이깁니다:** 지식 베이스 크기와 무관하게 257× 작은 컨텍스트, 더 나은 정답당 비용, 그리고 *증명 가능하게* 깨끗한 지식 베이스(10× 스케일에서 낡은 규칙 2/26 → 0/26). 쏟아붓기는 모든 스케일에서 26개 중 17–19개의 컨텍스트에 낡은 규칙을 실은 채 어텐션 운으로 피해 다녔고 — 결국 피하지 못했습니다.
- **잊기(unlearning)는 무인으로 작동하고, 다시 배우기(relearning)에는 소스가 필요합니다.** 승인/거부 신호만으로는 트레이니가 정직하게 "규칙 없음"에 도달합니다. 위키로 도착한 수정은 아무도 알려주지 않아도 채택되고(신뢰된 클래스에서 r=0), 검색으로 도착한 수정은 승격 경로를 통해 위키로 졸업합니다.
- **남은 실패는 인식론적이며, 3회 중 3회 재현됐습니다:** 방금 갱신된 올바른 규칙이 진심 어린 잘못된 불신으로 은퇴당할 수 있습니다 — 인용은 정확하고, 귀속도 올바르고, 집계도 정직한데, 결과가 틀린 경우입니다. 모든 메커니즘은 증거가 정직한지를 검사할 뿐, 옳은지는 검사할 수 없습니다. 큐레이터가 존재하는 이유입니다.

## 빠른 시작

Akela의 사용자는 역할이 다른 둘입니다. **여러분**은 설정하고 큐레이션하며, **여러분의 에이전트**가 매 작업마다 조작합니다.

**여러분, 1회 — 설치하고 지식을 가리키기:**

```bash
npx akela init --knowledge wiki   # akela.json + LEARNINGS.md + 에이전트 프로토콜 3종 (PROTOCOL, ONBOARD, CURATE)
#   --knowledge <dir>  기존 마크다운 폴더 경로 — wiki/, docs/, kb/, notes/ 무엇이든
#   --domain <pack>    선택: 도메인 팩 이름 또는 JSON 경로 (기본값 "default")
#   RAG는 init 플래그가 아닙니다 — 설치 후 akela.json 한 줄로 연결 (아래 "RAG가 있다면" 참고)
npx akela index                   # 주소를 가진 모든 섹션: <NS>-<file>#<id>  tier  scope
```

**여러분, 1회 — 에이전트 연결.** `init`이 운영 프로토콜을 **프로젝트 안** `akela/PROTOCOL.md`에 생성했습니다(`LEARNINGS.md` 옆, 커밋하세요). 디스크의 파일은 그 자체로는 아무것도 하지 않습니다 — 에이전트는 하네스가 로드하는 지시만 따릅니다. 그래서 연결은 에이전트가 자동으로 읽는 지시 파일(Claude Code는 `CLAUDE.md`, 그밖에 `AGENTS.md`, `.cursorrules`, 시스템 프롬프트)에 넣는 한 줄입니다:

> Follow `akela/PROTOCOL.md` for every task.

이 한 줄이 통합의 전부입니다. 없으면 Akela는 설치만 되고 연결되지 않은 상태입니다. (`init`이 지시 파일을 감지해 정확한 파일명을 알려 줍니다.)

**여러분 + 에이전트, 1회 — 지식 스코핑.** 스코프 없는 위키는 아무것도 패킹하지 않습니다(Akela는 관련성을 절대 추측하지 않습니다). `init`이 `akela/ONBOARD.md`도 생성했으니, 에이전트에게 *"Follow `akela/ONBOARD.md`"*라고 지시하세요. 어떤 섹션이 어떤 활동(activity)에 어떤 tier로 필요한지 초안을 검토용 표로 만들어 오면, 여러분이 승인하고, 승인된 스코핑이 설정 또는 태그로 적용됩니다. 잘 스코핑된 섹션 10개면 충분한 출발점입니다.

**에이전트, 매 작업 — 프로토콜에 따라 자동으로:**

```bash
akela compile --activity support --task T-123    # → slice.md: 도메인 지식의 유일한 소스
# … 슬라이스만으로 작업 수행 …
akela log applied WIKI-refunds#under-50          # "이 규칙에 의존했다"
akela log contradicted LRN-20260822-01 --note "…"  # "결과가 이 규칙이 틀렸음을 보여줬다" (원문 그대로 인용)
akela log outcome --status DONE                  # 실행 종료
```

**여러분, 주 10분 — 수치로 큐레이션:**

```bash
akela stats      # 소스별 증거 + 소견: 승격 후보 · 반증됨 · 중복 서술 · 휴면
akela check      # 편집 후 지식 베이스 검증
```

수치는 추천하고, 여러분이 결정합니다 — 그리고 검토 실무조차 위임할 수 있습니다. `init`이 `akela/CURATE.md`도 생성하므로, *"Follow `akela/CURATE.md`"* 한 마디면 전체 루틴이 에이전트가 초안을 만들고 여러분이 승인하는 표가 됩니다.

### 전체 사이클, 에이전트 주도

`init`이 프로토콜 3종을 생성하고, 에이전트가 사이클을 돌리며, 여러분은 판단만 제공합니다 — 각 결정 지점마다 검토용 표 하나와 예/아니오 하나:

| 시점 | 행동 주체 | 프로토콜 |
|---|---|---|
| 매 작업 | 에이전트: 컴파일 → 슬라이스로 작업 → 증거 기록 | `PROTOCOL.md` |
| 초기 스코핑, 그리고 새 페이지가 생길 때마다 | 에이전트가 scope/tier 초안, 여러분이 승인 (모든 `compile`이 미스코핑 드리프트를 보고하므로 새 페이지는 수 시간 안에 발견됩니다) | `ONBOARD.md` |
| 작업 중 중대 발견 | 에이전트가 지금 검토를 돌릴지 물어봄 | `PROTOCOL.md` → `CURATE.md` |
| 매주 (또는 스프린트마다) | 에이전트가 stats를 돌리고 노트를 읽어 검토용 표를 전달; 승인된 편집은 적용 후 검증 | `CURATE.md` |

이 분업이 설계입니다: **판단을 제외한 모든 것은 에이전트가 하고, 여러분은 판단만 — 그것도 판단할 증거가 있을 때만 — 제공합니다.** 전체 안내: [docs/ko/guide.md](docs/ko/guide.md).

## 전체 그림

다이어그램으로 보는 전체 구조 — 증거 루프, 선택, 규칙의 일생, 검색 노트의 졸업 — 는 [docs/ko/how-akela-works.md](docs/ko/how-akela-works.md)를, 일상 사용법(태깅, 에이전트 프로토콜, 큐레이션 루틴)은 [docs/ko/guide.md](docs/ko/guide.md)를 보세요. 첫 사용 질문에 대한 빠른 답: [docs/ko/faq.md](docs/ko/faq.md). Akela를 자신의 도구에 내장하기: [docs/embedding.md](docs/embedding.md)(영어). 설계 문서: [docs/DESIGN.md](docs/DESIGN.md)(영어).

```
 여러분의 마크다운 (wiki / references)       ← 여러분이 작성; Akela는 색인만
 ───────────────────────────────────
 LEARNINGS.md        LRN-20260822-01 …      ← 실행이 제안; 승격/은퇴는 여러분이
 ───────────────────────────────────
 akela compile  →  slice.md + 매니페스트     ← 결정론적; must 플로어, scope, 프로젝트 오버라이드
 akela log / fp →  learnings-log.jsonl      ← 읽기 경로가 기록을 남김: applied · contradicted · outcome
 akela stats    →  소견(findings)            ← 산술이지 판단이 아님; 모든 변경은 여러분이 승인
```

### 주소를 가진 섹션

지식 루트의 모든 `##` 제목은 안정적인 id를 가진 소스가 됩니다. 방법은 둘:

- **태그** — 제목 다음 줄에 `<!-- akela: id=refunds-under-50 scope=support tier=must -->`. id가 명시적이고, 파싱 오류는 시끄럽게 실패합니다. (상위 도구에서 이전된 콘텐츠의 레거시 `qab:` 태그도 그대로 인식됩니다.)
- **파생** (`"untagged": "derive"`) — id는 제목 슬러그에서 나오고, scope는 `all`, tier는 `should`가 기본입니다. 기존 위키를 한 글자도 고치지 않고 연결할 수 있습니다. 파생 섹션은 여러분이 스코핑하기 전까지(`compiler.scope`) 아무것도 기여하지 않으며, 그때까지 모든 매니페스트에 `dropped: general-scope`로 표시됩니다 — 선택은 색인기가 아니라 여러분의 것입니다.

### 도메인 팩

팩은 "여기서 어떤 종류의 일이 일어나는가"를 서술합니다: 활동 목록, 결정론적 프로파일 프로브, 실패 핑거프린트의 폐쇄 어휘, 결과 상태. `domains/default.json`은 프로브 없이 범용 어휘만 담고 있습니다. 팩의 모든 필드는 `akela.json`에 인라인으로도 선언할 수 있으므로(인라인 우선) 대부분의 프로젝트는 팩 파일을 아예 만들지 않습니다. 두 번째 프로젝트가 같은 어휘를 공유할 때 추출하고, `"domain"`에 아무 JSON 경로나 지정하세요. 팩은 그것을 정의하는 도메인의 소유이지 엔진의 소유가 아닙니다 — Akela 위에 만든 도구는 자신의 팩을 자신의 사용자에게 배포합니다. 전체 개념과 필드 레퍼런스: [domains/README.md](domains/README.md)(영어).

```jsonc
{
  "domain": "default",
  "knowledge": [
    { "path": "references", "namespace": "REF" },
    { "path": "wiki",       "namespace": "WIKI", "untagged": "derive" }
  ],
  "learnings": "akela/LEARNINGS.md",
  "runs": ".akela/runs",
  "activities": ["support", "triage"],
  "profile": { "tier": [ { "task": "^VIP-", "value": "vip" }, { "value": "standard" } ] },
  "fingerprints": ["wrong-answer", "stale-rule", "missing-context"],
  "compiler": {
    "scope": { "WIKI-refunds#under-50": { "add": ["support"] } },
    "retrievers": [ { "name": "rag", "cmd": "node scripts/retrieve.js" } ]
  }
}
```

### RAG가 있다면

리트리버는 어떤 커맨드든 될 수 있습니다. stdin으로 `{activity, task, profile}`을 받아 `[{id, heading, text}]`를 반환하면, 그 항목은 `EXT-<name>#<id>` id로, `context` tier로, 플로어 뒤에 `via: retriever:<name>` 표시와 함께 슬라이스에 들어갑니다 — 그리고 다른 모든 소스와 똑같이 인용되고 집계됩니다. Akela는 리트리버가 무언가를 제거하거나 순서를 바꾸는 것을 절대 허용하지 않습니다. 리트리버는 *오디션*을 볼 뿐이고, 그것이 실제로 적용됐는지는 실행 로그가 결정합니다.

## 설계

[docs/DESIGN.md](docs/DESIGN.md)(영어) — 문제, 설계 원칙, 다이어그램이 있는 아키텍처, 그리고 자명하지 않은 모든 결정의 근거 — 각 결정이 답하는 실패 사례와 정직하게 서술된 한계까지.

## 상태

`0.1.4` — 실험 프로그램과 첫 실제 소비자(QABuddy가 자체 1,275개 체크 스위트 전체를 CI에서 Akela에 대해 실행)를 거쳐 추출·일반화·강화된 엔진. 139개 체크 테스트 스위트, ubuntu + windows × Node 18–24. 증거 루프는 버전 범위화되어 있고(비난은 실행이 실제로 본 콘텐츠 해시에 귀속; 다시 쓰면 깨끗한 기록으로 시작), 캡처 게이트는 도메인 밖 한국어 코퍼스와 적대적 베드로 검증된 유니코드 인지 산술이며, 바이트 단위 재현으로 추출된 엔진이 상위 도구의 실제 컴파일 기록을 정확히 재현함을 확인했습니다. 자명하지 않은 모든 설계 결정은 관찰된 실패가 강제한 것이며 근거와 함께 [docs/DESIGN.md](docs/DESIGN.md) §5에 기록되어 있습니다. 알려진 미해결 항목: 대형 지식 베이스용 증거 전용 `stats` 뷰, 페이지 편집으로 제거된 값의 툼스톤, 반증 노출을 요구하는 승격 기준 — 뒤의 둘은 복제 실험이 지목한 연구 프런티어입니다.

---

**한 줄 테제:** AI 에이전트는 확률적이지만, 그를 둘러싼 지식 시스템까지 확률적일 필요는 없습니다. Akela는 에이전트의 컨텍스트에 무엇이 들어가는지에 대한 결정론적 통제, 모든 결정의 감사 추적, 그리고 그 아래 지식을 바꾸는 증거 기반 경로입니다.

## 라이선스

MIT
