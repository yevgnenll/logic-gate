# 🧠 Interactive Logic Gate Simulator
React와 TypeScript를 사용하여 제작된 웹 기반 논리 회로 시뮬레이터입니다. 사용자는 브라우저에서 직접 AND, OR, NOT과 같은 기본 논리 게이트를 조합하여 복잡한 회로를 설계하고, 그 동작을 실시간으로 시뮬레이션할 수 있습니다.

(이곳에 실제 동작 스크린샷 이미지 링크를 넣어주세요)

🔗 Live Demo: https://yevgnenll.github.io/logic-gate/

# ✨ 주요 기능 (Core Features)
직관적인 UI: 드래그 앤 드롭으로 게이트를 배치하고, 클릭으로 와이어를 연결하는 등 사용하기 쉬운 인터페이스를 제공합니다.

실시간 시뮬레이션: INPUT 게이트의 값을 바꾸면 신호가 회로를 따라 전파되는 과정이 실시간 애니메이션으로 시각화됩니다.

커스텀 컴포넌트: 여러 게이트를 조합하여 자신만의 커스텀 게이트(예: NAND, XOR)를 만들어 부품처럼 재사용할 수 있습니다.

추상화: 저장된 커스텀 게이트는 내부 회로가 숨겨진 깔끔한 블랙박스 형태로 나타납니다.

색상 지정: 커스텀 게이트마다 고유한 색상을 지정하여 시각적으로 구분할 수 있습니다.

캔버스 제어: 마우스 휠로 캔버스를 확대/축소하고, 마우스 가운데 버튼으로 **이동(Pan)**할 수 있습니다.

다중 선택 및 그룹 이동: 드래그로 영역을 선택하거나 Shift+클릭으로 여러 게이트를 선택하고, 한 번에 이동시킬 수 있습니다.

실행 취소/다시 실행: Cmd/Ctrl + Z, Cmd/Ctrl + Y 단축키로 모든 작업을 되돌리거나 다시 실행할 수 있습니다.

영구 저장: 생성한 커스텀 게이트는 브라우저의 Local Storage에 저장되어, 창을 닫았다가 다시 열어도 사라지지 않습니다.

공유 및 임베딩: 현재 작업 상태를 읽기 전용(Read-Only) 뷰로 공유할 수 있는 `<iframe>` 코드를 생성하여 블로그 등에 삽입할 수 있습니다.

# 🛠️ 기술 스택 (Tech Stack)
Framework: React

Language: TypeScript

Build Tool: Vite

Styling: Tailwind CSS

State Management: React Hooks (useState, useRef, useCallback, useEffect)

Deployment: GitHub Actions, GitHub Pages

# ⚙️ 주요 구현 내용 (How it Works)
1. 상태 관리 및 히스토리
   모든 게이트와 와이어의 상태는 App 컴포넌트의 useState를 통해 관리됩니다. 실행 취소/다시 실행 기능을 위해 다음과 같은 구조를 가진 커스텀 훅 useHistory를 구현했습니다.

past: 이전 상태들을 저장하는 배열

present: 현재 상태

future: 실행 취소했던 상태들을 저장하는 배열

사용자가 게이트를 추가하거나 와이어를 연결하는 등 구조적인 변경을 가할 때마다 present 상태를 past로 옮기고 새로운 상태를 present에 저장하여 히스토리를 기록합니다.

2. 렌더링 및 캔버스 제어
   SVG: 모든 게이트, 와이어, 연결 포트는 SVG 요소(<g>, <rect>, <path>, <circle>)로 렌더링됩니다. 이를 통해 자유로운 스타일링과 확대/축소 시에도 깨지지 않는 벡터 그래픽을 구현했습니다.

View Transform: 캔버스의 확대/축소 및 이동(Pan/Zoom)은 viewTransform이라는 상태 객체({x, y, k})를 통해 관리됩니다. SVG 최상위 그룹 <g>에 transform 속성을 적용하여 전체 캔버스를 제어합니다.

3. 사용자 인터랙션
   드래그 앤 드롭: 게이트의 onMouseDown 이벤트에서 드래그 시작을 감지하고, window의 mousemove, mouseup 이벤트를 리스닝하여 게이트의 위치를 업데이트합니다. 여러 게이트가 선택된 경우, 모든 선택된 게이트의 위치를 함께 계산하여 그룹 이동을 구현했습니다.

드래그 선택: 캔버스의 빈 공간에서 onMouseDown이 시작되면 선택 모드로 진입합니다. mousemove 이벤트에서 마우스의 시작점과 현재 위치를 기반으로 사각형 영역(selectionBox)을 계산하여 화면에 표시하고, mouseUp 시점에 해당 영역에 포함된 모든 게이트를 선택 상태로 변경합니다.

와이어 연결: 출력 포트를 클릭하면 connecting 상태가 활성화되고, 마우스 커서를 따라 노란 선이 그려집니다. 이후 입력 포트를 클릭하면 connecting 상태 정보를 바탕으로 새로운 와이어를 생성합니다. Esc 키를 누르면 connecting 상태가 null이 되어 연결이 취소됩니다.

4. 커스텀 컴포넌트와 시뮬레이션
   추상화: 사용자가 INPUT과 OUTPUT 게이트를 포함한 영역을 선택하고 저장하면, 해당 게이트들은 새로운 커스텀 게이트의 입출력 포트로 정의됩니다. 내부 회로의 정보(게이트, 와이어)는 CustomGateTemplate 객체로 Local Storage에 저장됩니다.

재귀적 시뮬레이션: 메인 시뮬레이션 루프는 커스텀 게이트를 만나면, 해당 게이트의 내부 회로를 별도로 시뮬레이션합니다. 외부에서 들어온 입력 값을 내부 INPUT 게이트에 전달하고, 시뮬레이션 결과로 나온 내부 OUTPUT 게이트의 값을 다시 커스텀 게이트의 출력 값으로 설정하는 재귀적인 구조로 동작합니다.

5. 공유 및 임베딩
   'Share' 버튼을 클릭하면 현재의 gates와 wires 상태를 JSON으로 변환하고, 이를 Base64로 인코딩하여 URL 파라미터(?view=...)로 만듭니다. 이 URL을 src로 사용하는 `<iframe>` 코드를 생성합니다. 앱은 로딩 시 URL에 view 파라미터가 있는지 확인하고, 있다면 해당 데이터를 불러와 읽기 전용 모드로 캔버스를 렌더링합니다.

# 🚀 시작하기 (Getting Started)
## 1. 저장소 복제
```
git clone [https://github.com/yevgnenll/logic-gate](https://github.com/yevgnenll/logic-gate)
cd your-repo-name
```
## 2. pnpm 설치 (설치되지 않은 경우)

```
npm install -g pnpm
```

## 3. 의존성 설치
```
pnpm install
```

## 4. 개발 서버 실행

```
pnpm run dev
```


# 🌐 배포 (Deployment)

이 프로젝트는 GitHub Actions를 통해 main 브랜치에 푸시될 때마다 자동으로 GitHub Pages에 배포되도록 설정되어 있습니다.

배포 설정은 .github/workflows/deploy.yml 파일에 정의되어 있습니다.

Vite 설정 파일(vite.config.ts)의 base 옵션은 GitHub Pages 경로에 맞게 수정해야 합니다.