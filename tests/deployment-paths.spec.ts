import { describe, expect, it } from 'vitest'
import { Config } from '../src/deployment.ts'
import { ExecutorConfigSchema } from '../src/policy.ts'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('deployment state directory paths', () => {
  it.each(['/var/lib/superagent', 'C:/Users/agent/.dsh/state', 'C:\\Users\\agent\\.dsh\\state', '\\\\server\\share\\state'])(
    'accepts absolute path %s', stateDir => {
      expect(Config({ stateDir }).stateDir).toBe(stateDir)
    },
  )

  it.each(['relative/state', '~/state', 'C:state', ''])(
    'rejects relative path %s', stateDir => {
      expect(() => Config({ stateDir })).toThrow()
    },
  )
})

describe('executor directory paths', () => {
  it('accepts an absolute directory on the host platform', () => {
    const directory = join(tmpdir(), 'superagent-work')
    expect(ExecutorConfigSchema.parse({ directory }).directory).toBe(directory)
  })

  it('rejects a relative directory', () => {
    expect(() => ExecutorConfigSchema.parse({ directory: 'relative/work' })).toThrow()
  })
})
