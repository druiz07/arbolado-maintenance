// Cliente mínimo de Dependabot Alerts API.
// https://docs.github.com/en/rest/dependabot/alerts
//
// Requiere PAT con scope:
//   - contents: read (para arbolado-app)
//   - security_events: read (para alerts)
// El PAT viene del secret GH_PAT_ARBOLADO_APP.

export type DependabotAlert = {
  number: number;
  state: 'open' | 'fixed' | 'dismissed' | 'auto_dismissed';
  dependency: {
    package: { ecosystem: string; name: string };
    manifest_path: string;
    scope: 'development' | 'runtime' | null;
  };
  security_advisory: {
    ghsa_id: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    summary: string;
    vulnerabilities: Array<{
      package: { ecosystem: string; name: string };
      vulnerable_version_range: string;
      first_patched_version: { identifier: string } | null;
    }>;
  };
  security_vulnerability: {
    package: { ecosystem: string; name: string };
    vulnerable_version_range: string;
    first_patched_version: { identifier: string } | null;
    severity: 'low' | 'medium' | 'high' | 'critical';
  };
  created_at: string;
  updated_at: string;
  fixed_at: string | null;
  dismissed_at: string | null;
};

const GH_BASE = 'https://api.github.com';

export async function listOpenDependabotAlerts(
  owner: string,
  repo: string,
  pat: string,
): Promise<DependabotAlert[]> {
  const url = `${GH_BASE}/repos/${owner}/${repo}/dependabot/alerts?state=open&per_page=100`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${pat}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'arbolado-maintenance-detector',
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`dependabot_api_error:${res.status}:${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as DependabotAlert[];
  // Filtrar a npm — el ecosistema relevante para Arbolado
  return data.filter((a) => a.dependency.package.ecosystem === 'npm');
}
