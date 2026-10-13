# Matrix & Barcode — CD 컬렉션 관리

보유한 CD 앨범을 **바코드**와 **매트릭스(런아웃) 번호**까지 기록하며 관리하는 웹 사이트입니다.
구글 계정으로 로그인하면 컬렉션이 서버(Firebase)에 저장되어 어느 기기에서나 볼 수 있고, 로그인하지 않으면 그 기기에만 저장됩니다.

## 주요 기능

- **앨범 → CD 구조** — 앨범을 등록하고 그 안에 CD를 여러 장(2CD, CD+DVD 등) 추가
- **표지 등록** — 사진 선택/촬영, 또는 바코드 검색 시 자동으로 가져오기
- **CD별 기록** — 디스크 종류, 부제, 매트릭스/런아웃, IFPI Mastering SID · Mould SID, 트랙리스트, 메모
- **바코드 스캔** — 휴대폰 카메라로 EAN/UPC 바코드 인식
- **자동 정보 채우기** — 바코드로 [MusicBrainz](https://musicbrainz.org)를 검색해 앨범 정보·디스크 구성·트랙리스트·표지를 가져옴 (가입/키 불필요)
- **중복 확인** — 같은 바코드가 이미 있으면 매트릭스와 함께 알려주고, "다른 프레싱 등록"으로 쉽게 추가
- **수집 정보** — 보유/위시리스트/처분 상태, 컨디션, 보관 위치, 구입일·구입처·가격, 평점, 태그
- **사이드바** — 상태별·아티스트별(기록) 탐색, 통계, 백업
- **발매일** — 연-월-일 전체 날짜 입력 (MusicBrainz에 연도만 있으면 연도만 보관)
- **검색** — 제목/아티스트/바코드/매트릭스(띄어쓰기·하이픈 무시) 통합 검색
- **구글 로그인 · 서버 저장** — 사람마다 자기 컬렉션이 따로 저장되고, 여러 기기에서 실시간으로 같이 보임
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

- **로그인한 경우**: Firebase Firestore의 `users/{uid}/albums/{albumId}`에 저장됩니다. 보안 규칙으로 본인만 읽고 쓸 수 있습니다.
- **로그인하지 않은 경우**: 그 브라우저의 IndexedDB에만 저장됩니다. 나중에 로그인하면 계정으로 옮길지 묻습니다.
- Firebase 설정값은 `js/firebase-config.js`에 있습니다 (공개되어도 되는 값).

Firestore 보안 규칙:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/albums/{albumId} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

## 파일 구조

```
index.html        화면 구성
css/style.css     스타일 (라이트/다크 모드, 모바일 대응)
js/dialog.js      구형 Safari용 팝업 대체 구현
js/firebase-config.js  Firebase 설정
js/cloud.js       구글 로그인 · Firestore 저장소
js/db.js          IndexedDB 저장소 (로그인 전)
js/util.js        공통 함수 (바코드 체크섬, 이미지 축소, CSV 등)
js/lookup.js      MusicBrainz / Cover Art Archive 조회
js/scanner.js     카메라 바코드 스캐너
js/app.js         앱 로직
```

## 배포할 때 참고

`index.html`의 CSS/JS 주소 뒤 `?v=숫자`를 올려야 Safari가 예전 파일을 캐시해 쓰지 않습니다.
