class LuaReportEvent {
  public message: string;
  public isError: boolean;
  public line: number;
  public startColumn: number;
  public endColumn: number;
}

export class LuaReport {
  public events: Array<LuaReportEvent>;
}
