import { ref } from "vue";
import type { PersonalLedger, RestoreResult, Theme } from "../types";
import { useLedger } from "./useLedger";
import { useNavigation } from "./useNavigation";
import { useChat } from "./useChat";

function storedTheme(): Theme {
  try {
    const value = localStorage.getItem("pe.theme.v1");
    return value === "light" || value === "midnight" ? value : "dark";
  } catch {
    return "dark";
  }
}

export function useWorkspace() {
  const theme = ref<Theme>(storedTheme());
  document.documentElement.dataset.peTheme = theme.value;

  function setTheme(next: Theme) {
    theme.value = next;
    document.documentElement.dataset.peTheme = next;
    try { localStorage.setItem("pe.theme.v1", next); } catch {}
  }

  const ledger = useLedger();
  const navigation = useNavigation(ledger);
  const chat = useChat(ledger, navigation);

  function focusComposer() {
    if (ledger.api.view.value === "sample") navigation.api.setView("personal");
    navigation.api.setPage("market");
    chat.internal.requestFocus();
  }
  function clearPersonalData() {
    chat.internal.clearInFlight();
    ledger.internal.clearData();
    navigation.internal.resetForClear();
  }
  function restorePersonal(next: PersonalLedger): RestoreResult {
    const result = ledger.internal.restoreBackup(next);
    if (!result.ok) return result;
    chat.internal.clearInFlight();
    navigation.internal.resetForRestore();
    return result;
  }
  function resetChat() {
    navigation.api.setFocus(false);
    chat.api.resetChat();
  }

  return {
    ...ledger.api,
    ...navigation.api,
    ...chat.api,
    theme,
    setTheme,
    focusComposer,
    clearPersonalData,
    restorePersonal,
    resetChat,
  };
}

export type Workspace = ReturnType<typeof useWorkspace>;