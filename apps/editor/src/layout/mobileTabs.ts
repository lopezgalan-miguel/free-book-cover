// Pestañas del diseño móvil (SDD R-10) y estado de la hoja inferior. Lógica pura.
export const MOBILE_TABS = ["text", "font", "color", "style", "canvas"] as const;
export type MobileTab = (typeof MOBILE_TABS)[number];

export interface SheetState {
  tab: MobileTab;
  open: boolean;
}

export const initialSheet: SheetState = { tab: "text", open: false };

// Tocar la pestaña activa con la hoja abierta la cierra; cualquier otra la abre en esa pestaña.
export function pressTab(s: SheetState, tab: MobileTab): SheetState {
  return s.open && s.tab === tab ? { ...s, open: false } : { tab, open: true };
}

export const closeSheet = (s: SheetState): SheetState => (s.open ? { ...s, open: false } : s);

// Secciones del panel de texto que muestra cada pestaña (null = no usa el panel de texto).
export type TextSection = "text" | "font" | "style" | "color" | "fx";
export const TAB_TEXT_SECTIONS: Record<MobileTab, readonly TextSection[] | null> = {
  text: ["text"],
  font: ["font"],
  color: ["color"],
  style: ["style", "fx"],
  canvas: null,
};

// Teclas de flecha en la barra de pestañas: devuelve la pestaña a enfocar (rotativa).
export function nextTab(current: MobileTab, key: string): MobileTab | null {
  const i = MOBILE_TABS.indexOf(current);
  if (key === "ArrowRight") return MOBILE_TABS[(i + 1) % MOBILE_TABS.length]!;
  if (key === "ArrowLeft") return MOBILE_TABS[(i + MOBILE_TABS.length - 1) % MOBILE_TABS.length]!;
  if (key === "Home") return MOBILE_TABS[0]!;
  if (key === "End") return MOBILE_TABS[MOBILE_TABS.length - 1]!;
  return null;
}
