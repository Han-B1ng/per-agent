import type { BackupParseResult, PersonalLedger } from "../frontend/src/types";

export function emptyPersonal(): PersonalLedger;
export function loadPersonal(): PersonalLedger;
export function savePersonal(records: PersonalLedger): boolean;
export function parsePersonalBackup(text: string): BackupParseResult;
export function clearPersonal(): PersonalLedger;
export function getClientId(): string;
export function genId(prefix: string): string;