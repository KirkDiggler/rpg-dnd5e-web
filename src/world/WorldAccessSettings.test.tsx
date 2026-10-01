import { create } from '@bufbuild/protobuf';
import { Code, ConnectError } from '@connectrpc/connect';
import { WorldSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/api/world/v1alpha1/service_pb';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorldAccessSettings } from './WorldAccessSettings';

const client = vi.hoisted(() => ({
  getWorld: vi.fn(),
  setWorldRoles: vi.fn(),
  setWorldMemberRoles: vi.fn(),
}));
vi.mock('../api/client', () => ({ worldClient: client }));
const worldId = '123456789012345678';
const roles = {
  adminRoleId: '223456789012345678',
  builderRoleId: '323456789012345678',
  playerRoleId: '423456789012345678',
};
const world = create(WorldSchema, { worldId, roles });

beforeEach(() => {
  vi.resetAllMocks();
  client.getWorld.mockResolvedValue({ world });
  client.setWorldRoles.mockResolvedValue({ world });
  client.setWorldMemberRoles.mockResolvedValue({ world });
});

describe('WorldAccessSettings', () => {
  it('allows owner bootstrap when no configuration exists', async () => {
    client.getWorld.mockRejectedValue(
      new ConnectError('not configured', Code.NotFound)
    );
    render(<WorldAccessSettings worldId={worldId} onBack={vi.fn()} />);
    await screen.findByLabelText('World admin role ID');
    fireEvent.change(screen.getByLabelText('World admin role ID'), {
      target: { value: roles.adminRoleId },
    });
    fireEvent.change(screen.getByLabelText('World builder role ID'), {
      target: { value: roles.builderRoleId },
    });
    fireEvent.change(screen.getByLabelText('Player role ID'), {
      target: { value: roles.playerRoleId },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Save all roles (server owner)' })
    );
    await screen.findByText('Server access saved.');
    expect(client.setWorldRoles).toHaveBeenCalledWith({ worldId, roles });
  });

  it('delegated saves never submit an admin-role change', async () => {
    render(<WorldAccessSettings worldId={worldId} onBack={vi.fn()} />);
    await screen.findByLabelText('World admin role ID');
    fireEvent.change(screen.getByLabelText('World admin role ID'), {
      target: { value: '523456789012345678' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Save builder/player roles' })
    );
    await screen.findByText(
      'Builder and player access saved. Admin authority is unchanged.'
    );
    expect(client.setWorldMemberRoles).toHaveBeenCalledWith({
      worldId,
      builderRoleId: roles.builderRoleId,
      playerRoleId: roles.playerRoleId,
    });
    expect(client.setWorldRoles).not.toHaveBeenCalled();
    expect(screen.getByLabelText('World admin role ID')).toHaveValue(
      roles.adminRoleId
    );
  });

  it('surfaces provider-authorized refusals rather than reporting a save', async () => {
    client.setWorldRoles.mockRejectedValue(
      new ConnectError(
        'Only the server owner can change admins',
        Code.PermissionDenied
      )
    );
    render(<WorldAccessSettings worldId={worldId} onBack={vi.fn()} />);
    await screen.findByLabelText('World admin role ID');
    fireEvent.click(
      screen.getByRole('button', { name: 'Save all roles (server owner)' })
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Only the server owner can change admins'
    );
    expect(screen.queryByText('Server access saved.')).not.toBeInTheDocument();
  });

  it('refuses configuration outside a server or when access is denied', async () => {
    const { rerender } = render(
      <WorldAccessSettings worldId={null} onBack={vi.fn()} />
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Open this Activity in a Discord server'
    );
    expect(client.getWorld).not.toHaveBeenCalled();
    client.getWorld.mockRejectedValue(
      new ConnectError('World admin access required', Code.PermissionDenied)
    );
    rerender(<WorldAccessSettings worldId={worldId} onBack={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'World admin access required'
      )
    );
    expect(
      screen.queryByLabelText('World admin role ID')
    ).not.toBeInTheDocument();
  });
});
