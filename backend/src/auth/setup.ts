export interface User {
  id: number;
  google_id: string;
  email: string;
  name: string;
  avatar: string | null;
  slack_access_token: string | null;
  slack_team_id: string | null;
  slack_team_name: string | null;
  created_at: string;
  updated_at: string;
}
