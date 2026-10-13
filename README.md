# Matrix & Barcode — CD 컬렉션 관리

보유한 CD 앨범을 **바코드**와 **매트릭스(런아웃) 번호**까지 기록하며 관리하는 웹 사이트입니다.
서버·회원가입 없이 브라우저만으로 동작하고, GitHub Pages에 그대로 올려 쓸 수 있습니다.

## 주요 기능

- **앨범 등록/수정/삭제** — 제목, 아티스트, 레이블, 카탈로그 번호, 발매년도·국가, 포맷(CD, SACD, SHM-CD …), 에디션
- **바코드 스캔** — 휴대폰 카메라로 EAN/UPC 바코드 인식 (Chrome의 내장 BarcodeDetector, 그 외 브라우저는 ZXing 자동 로드)
- **자동 정보 채우기** — 바코드로 [MusicBrainz](https://musicbrainz.org)를 검색해 앨범 정보·트랙리스트·커버([Cover Art Archive](https://coverartarchive.org))를 가져옴
- **매트릭스 / 런아웃 기록** — 디스크별 매트릭스 번호, IFPI Mastering SID, Mould SID. 같은 바코드의 다른 프레싱 구분
- **중복 확인** — 이미 같은 바코드가 등록되어 있으면 매트릭스와 함께 알려줌
- **수집 정보** — 보유/위시리스트/처분 상태, 디스크·케이스 컨디션, 보관 위치, 구입일·구입처·가격, 평점, 태그, 메모
- **검색·필터·정렬** — 제목/아티스트/바코드/매트릭스/카탈로그 번호 통합 검색, 그리드·리스트 보기
- **통계** — 보유 장수, 총 구입액, 아티스트·연대·포맷·레이블별 분포
- **백업** — JSON 백업/복원, CSV(엑셀) 내보내기

## 실행 방법

빌드 과정이 없는 정적 사이트입니다.

```bash
# 로컬에서 실행
python3 -m http.server 8000
# → http://localhost:8000
```

> 카메라 스캔은 보안상 `https://` 또는 `localhost`에서만 동작합니다.

### GitHub Pages로 배포

저장소 **Settings → Pages → Build and deployment**에서 Source를 `Deploy from a branch`, 브랜치를 선택하고 폴더를 `/ (root)`로 지정하면
`https://<사용자명>.github.io/matrixandbarcode/` 주소로 접속할 수 있습니다.

## 데이터 저장

- 모든 데이터는 접속한 브라우저의 **IndexedDB**에 저장됩니다 (서버로 전송되지 않음).
- 기기마다 데이터가 따로 저장되므로, 다른 기기로 옮길 때는 **백업/설정 → JSON 백업**을 내보내 불러오세요.
- 브라우저 데이터를 삭제하면 컬렉션도 지워지니 주기적으로 백업하세요.

## 파일 구조

```
index.html        화면 구성
css/style.css     스타일 (라이트/다크 모드, 모바일 대응)
js/db.js          IndexedDB 저장소
js/util.js        공통 함수 (바코드 체크섬, 이미지 축소, CSV 등)
js/lookup.js      MusicBrainz / Cover Art Archive 조회
js/scanner.js     카메라 바코드 스캐너
js/app.js         앱 로직
```
