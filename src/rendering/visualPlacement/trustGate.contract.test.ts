import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/licensed-assets.yml', 'utf8');
const stageScript = readFileSync(
  'scripts/stage-locked-synty-assets.sh',
  'utf8'
);

describe('licensed exact-head trust boundary', () => {
  it('uses a same-repo PR, protected environment, exact head, and no target-context checkout', () => {
    expect(workflow).toContain('environment: licensed-assets');
    expect(workflow).toContain('head.repo.full_name == github.repository');
    expect(workflow).toContain('github.event.pull_request.head.sha');
    expect(workflow).toContain('persist-credentials: false');
    expect(workflow).not.toContain('pull_request_target');
    expect(workflow).not.toContain('actions/cache');
  });

  it('scopes the private token to provider checkout and allowlists safe artifacts', () => {
    expect(workflow.match(/RPG_GAME_ASSETS_READ_TOKEN/g)).toHaveLength(1);
    expect(workflow).toContain('find safe-evidence -type f | wc -l');
    expect(workflow).toContain("! -name '*.json' ! -name '*.txt'");
    expect(workflow).not.toContain('path: public/');
  });

  it('requires detached exact-SHA clean producer checks and atomic verifier stage', () => {
    expect(stageScript).toContain('symbolic-ref -q HEAD');
    expect(stageScript).toContain('status --porcelain');
    expect(stageScript).toContain('build_web_asset_catalog.py --check');
    expect(stageScript).toContain('build_synty_complete_inventory.py --check');
    expect(stageScript).toContain('verify_web_asset_stage.py --verify-only');
    expect(stageScript).toContain('verify_web_asset_stage.py --destination');
  });
});
