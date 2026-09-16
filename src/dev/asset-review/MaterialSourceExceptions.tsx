import type { MaterialSourceAudit } from './materialProfile';

export function MaterialSourceExceptions({
  audit,
}: {
  audit: MaterialSourceAudit;
}) {
  return (
    <section className="material-source-exceptions" aria-label="Source audit">
      <p>
        {audit.verifiedCount} source layouts reconciled;{' '}
        {audit.exceptions.length} unresolved sources. Layout correspondence is
        not material or appearance approval.
      </p>
      {audit.exceptions.length > 0 && (
        <details>
          <summary>Source exceptions ({audit.exceptions.length})</summary>
          <p>
            These sources are excluded from prepared examples, not silently
            repaired. Open the generated local file in Blender to inspect the
            original objects and slots. Scene edits are experiments, not saved
            profile decisions or approval.
          </p>
          {audit.exceptions.map((issue) => (
            <article key={issue.sourcePath}>
              <h3>{issue.sourcePath}</h3>
              <p>{issue.reason}</p>
              <p>
                Open in Blender: <code>{issue.inspectionBlendPath}</code>
              </p>
              <details>
                <summary>Imported slots and vendor declarations</summary>
                {issue.objects.map((obj) => (
                  <div key={obj.objectName}>
                    <h4>
                      {obj.objectName} — mesh data {obj.meshDataName}
                    </h4>
                    <ul>
                      {obj.materialNames.map((material, slot) => (
                        <li key={slot}>
                          Slot {slot}: {material ?? '(no material)'} —{' '}
                          {obj.usedSlots.includes(slot)
                            ? 'used by faces'
                            : 'unused'}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                <h4>Vendor declarations (not assumed to match)</h4>
                <ul>
                  {issue.declaredSlots.map((slot, index) => (
                    <li key={index}>
                      {slot.objectName}, slot {slot.slot}: {slot.materialName}
                    </li>
                  ))}
                </ul>
              </details>
            </article>
          ))}
        </details>
      )}
    </section>
  );
}
