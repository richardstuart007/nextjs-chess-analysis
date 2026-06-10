'use server'

//----------------------------------------------------------------------------------
//  startPipelineLog — insert a row at batch start with the intended item count.
//  Row exists even if the batch is cancelled; pip_processed stays 0 in that case.
//----------------------------------------------------------------------------------
export async function startPipelineLog(
  step:        number,
  stepName:    string,
  attempted:   number,
  start?:      number,
  remaining?:  number,
  dateFrom?:   string,
  dateTo?:     string
): Promise<number> {
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()
  const res = await db.query({
    caller:       'startPipelineLog',
    query:        `
      INSERT INTO tpip_pipelinelog
        (pip_step, pip_step_name, pip_date_from, pip_date_to, pip_start, pip_remaining, pip_finish, pip_attempted, pip_processed, pip_errors, pip_skipped, pip_duration_ms)
      VALUES ($1, $2, $3, $4, $5, $6, 0, $7, 0, 0, 0, 0)
      RETURNING pip_pipid
    `,
    params:       [step, stepName, dateFrom ?? null, dateTo ?? null, start ?? 0, remaining ?? 0, attempted],
    functionName: 'startPipelineLog'
  })
  return res.rows[0].pip_pipid as number
}

//----------------------------------------------------------------------------------
//  completePipelineLog — update the row with final counts once the batch finishes
//----------------------------------------------------------------------------------
export async function completePipelineLog(
  id:         number,
  processed:  number,
  errors:     number,
  skipped:    number,
  durationMs: number,
  finish?:    number
): Promise<void> {
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()
  await db.query({
    caller:       'completePipelineLog',
    query:        `
      UPDATE tpip_pipelinelog
      SET pip_finish      = $2,
          pip_processed   = $3,
          pip_errors      = $4,
          pip_skipped     = $5,
          pip_duration_ms = $6
      WHERE pip_pipid = $1
    `,
    params:       [id, finish ?? 0, processed, errors, skipped, durationMs],
    functionName: 'completePipelineLog'
  })
}

//----------------------------------------------------------------------------------
//  getPipelineRates — avg ms/item for each step, last 10 completed runs per step.
//  Rows with pip_processed = 0 are cancelled/incomplete runs and are excluded.
//----------------------------------------------------------------------------------
export async function getPipelineRates(): Promise<{
  step2: number | null
  step3: number | null
  step4: number | null
  step5: number | null
}> {
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()
  const res = await db.query({
    caller: 'getPipelineRates',
    query: `
      SELECT
        SUM(CASE WHEN pip_step = 2 AND rn <= 10 THEN pip_duration_ms END)::float
          / NULLIF(SUM(CASE WHEN pip_step = 2 AND rn <= 10 THEN pip_processed END), 0) AS rate2,
        SUM(CASE WHEN pip_step = 3 AND rn <= 10 THEN pip_duration_ms END)::float
          / NULLIF(SUM(CASE WHEN pip_step = 3 AND rn <= 10 THEN pip_processed END), 0) AS rate3,
        SUM(CASE WHEN pip_step = 4 AND rn <= 10 THEN pip_duration_ms END)::float
          / NULLIF(SUM(CASE WHEN pip_step = 4 AND rn <= 10 THEN pip_processed END), 0) AS rate4,
        SUM(CASE WHEN pip_step = 5 AND rn <= 10 THEN pip_duration_ms END)::float
          / NULLIF(SUM(CASE WHEN pip_step = 5 AND rn <= 10 THEN pip_processed END), 0) AS rate5
      FROM (
        SELECT pip_step, pip_processed, pip_duration_ms,
               ROW_NUMBER() OVER (PARTITION BY pip_step ORDER BY pip_pipid DESC) AS rn
        FROM tpip_pipelinelog
        WHERE pip_processed > 0
      ) ranked
    `,
    params:       [],
    functionName: 'getPipelineRates'
  })
  const r = res.rows[0]
  return {
    step2: r.rate2 != null ? Number(r.rate2) : null,
    step3: r.rate3 != null ? Number(r.rate3) : null,
    step4: r.rate4 != null ? Number(r.rate4) : null,
    step5: r.rate5 != null ? Number(r.rate5) : null,
  }
}
