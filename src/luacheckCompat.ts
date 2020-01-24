interface LuaReportEvent {
    message: string;
    isError: boolean;
    line: number;
    startColumn: number;
    endColumn: number;
}

export interface LuaReport {
    events: Array<LuaReportEvent>;
}
