import type { BackupParseResult, PersonalLedger, PersonalLoadState } from "../frontend/src/types";

export function emptyPersonal(): PersonalLedger;
export function loadPersonal(): PersonalLedger;
export function loadPersonalState(): PersonalLoadState;
export function savePersonal(records: PersonalLedger): boolean;
export function parsePersonalBackup(text: string): BackupParseResult;
export function clearPersonal(): PersonalLedger;
export function getClientId(): string;
export function genId(prefix: string): string;