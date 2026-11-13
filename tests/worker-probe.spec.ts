import { afterEach, expect, it, vi } from 'vitest'
import type { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
import { delimiter, join } from 'node:path'
import { tmpdir } from 'node:os'
import { workerProbe } from '../src/deployment.ts'
import { workerBin } from '../src/infra/environment.ts'

afterEach(() => vi.unstubAllEnvs())

it('passes a shim-free PATH without requiring an external env executable', async () => {
  const state = join(tmpdir(), 'superagent-probe')
  const realBin = join(tmpdir(), 'superagent-real-bin')
  vi.stubEnv('PATH', [workerBin(state), realBin].join(delimiter))
  const spawn = vi.fn(() => ({
    done: Promise.resolve({ exitCode: 0 }),
    collected: { stdout: { readFrom: () => ({ text: '{"login":"agent"}' }) } },
  }))
  const probe = workerProbe({ spawn } as unknown as SubprocessRuntime, state, state, new AbortController().signal)
  expect(await probe(['gh', 'api', 'user'])).toBe('{"login":"agent"}')
  expect(spawn).toHaveBeenCalledWith(expect.objectContaining({
    argv: ['gh', 'api', 'user'], cwd: state, env: { PATH: realBin },
  }))
})
