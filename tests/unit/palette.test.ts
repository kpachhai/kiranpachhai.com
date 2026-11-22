import { describe, expect, it } from 'vitest'
import { model } from '../../src/model'
import { buildIslandData } from '../../src/island/data'
import { commandList } from '../../src/island/palette'
import { sourceLabel } from '../../src/lib/provenance'
import { upstream } from '../../src/lib/site'

const data = buildIslandData(model, (source) => sourceLabel(source), upstream)

describe('palette commands', () => {
  // Areas, methods and materials share the `kp <id>` space, so an id reused across them would leave
  // one of the two unreachable by its exact command.
  it('every kp command label is unique across areas, methods and materials', () => {
    const labels = commandList(data).map((command) => command.label)
    expect(labels).toHaveLength(data.domains.length + data.methods.length + data.materials.length)
    expect(labels.filter((label, position) => labels.indexOf(label) !== position)).toEqual([])
  })
})
