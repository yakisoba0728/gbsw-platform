"use client";

/**
 * 저장하지 않은 수정이 있는가.
 *
 * 학생 탭의 재적 표는 고친 값을 컴포넌트 상태로 들고 있다가 「저장」을 눌러야
 * 보낸다. 탭을 옮기면 그 컴포넌트가 내려가면서 고친 것이 **말없이 사라진다** —
 * 예전에는 사이드바로 화면을 떠나야 했지만, 지금은 필터처럼 생긴 칩 하나로
 * 같은 일이 일어난다. 떠나기 전에 한 번 묻기 위한 표시다.
 *
 * 모듈 하나에 담는다. 표와 탭 줄은 서로 부모·자식이 아니고, 이 한 가지를 위해
 * 컨텍스트를 세우면 트리 모양이 상태를 따라 휘어진다. 브라우저 번들에서는 이
 * 모듈이 하나뿐이라 둘이 같은 값을 본다.
 */

let unsaved = false;

export function setUnsavedEdits(value: boolean): void {
  unsaved = value;
}

export function hasUnsavedEdits(): boolean {
  return unsaved;
}
