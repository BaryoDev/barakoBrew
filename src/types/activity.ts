// The activity feed row, as GET /api/activity returns it (camelCase over the wire).

export interface ActivityActor {
  kind: string;
  name: string;
}

export interface ActivitySubject {
  kind: string;
  id: string;
  title: string;
}

export interface ActivityRow {
  id: string;
  at: string;
  kind: string;
  severity: string;
  actor: ActivityActor;
  subject: ActivitySubject;
  text: string;
  /** The console deep link to the object, such as `/content/123`. */
  ref: string;
}

export interface ActivityPage {
  items: ActivityRow[];
  /** Opaque. Null or absent when there is nothing older. */
  nextCursor: string | null;
}
