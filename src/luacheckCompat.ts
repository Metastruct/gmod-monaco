interface LuaReportEvent {
    message: string;
    isError: boolean;
    line: number;
    startColumn: number;
    endColumn: number;
    luacheckCode: string;
}

export interface LuaReport {
    events: Array<LuaReportEvent>;
}
