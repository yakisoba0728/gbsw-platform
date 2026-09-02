"use client";

let unsaved = false;

export function setUnsavedEdits(value: boolean): void {
  unsaved = value;
}

export function hasUnsavedEdits(): boolean {
  return unsaved;
}
