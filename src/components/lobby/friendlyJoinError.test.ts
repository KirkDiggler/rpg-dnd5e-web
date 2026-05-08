import { Code, ConnectError } from '@connectrpc/connect';
import { describe, expect, it } from 'vitest';
import { friendlyJoinError } from './friendlyJoinError';

describe('friendlyJoinError', () => {
  it('returns a friendly message for "already in encounter"', () => {
    const err = new ConnectError(
      'player already in encounter',
      Code.AlreadyExists
    );
    expect(friendlyJoinError(err)).toBe(
      'You are already in an encounter. Leave your current game before joining another.'
    );
  });

  it('matches "already in encounter" substring case-insensitively', () => {
    const err = new Error('PLAYER ALREADY IN ENCOUNTER');
    expect(friendlyJoinError(err)).toBe(
      'You are already in an encounter. Leave your current game before joining another.'
    );
  });

  it('returns a friendly message for "encounter not found"', () => {
    const err = new ConnectError('encounter not found', Code.NotFound);
    expect(friendlyJoinError(err)).toBe(
      'Game not found. Check the code and try again.'
    );
  });

  it('matches "invalid code" substring', () => {
    const err = new Error('invalid code provided');
    expect(friendlyJoinError(err)).toBe(
      'Game not found. Check the code and try again.'
    );
  });

  it('returns a friendly message for full lobby', () => {
    const err = new ConnectError('lobby is full', Code.ResourceExhausted);
    expect(friendlyJoinError(err)).toBe('This game is already full.');
  });

  it('matches "full" substring', () => {
    const err = new Error('encounter full');
    expect(friendlyJoinError(err)).toBe('This game is already full.');
  });

  it('returns generic message for unknown Connect errors', () => {
    const err = new ConnectError('internal server error', Code.Internal);
    expect(friendlyJoinError(err)).toBe(
      'Failed to join lobby. Please try again or check the code.'
    );
  });

  it('returns generic message for generic Error', () => {
    const err = new Error('something unexpected');
    expect(friendlyJoinError(err)).toBe(
      'Failed to join lobby. Please try again or check the code.'
    );
  });

  it('returns generic message for non-Error values', () => {
    expect(friendlyJoinError('string error')).toBe(
      'Failed to join lobby. Please try again or check the code.'
    );
    expect(friendlyJoinError(null)).toBe(
      'Failed to join lobby. Please try again or check the code.'
    );
  });
});
