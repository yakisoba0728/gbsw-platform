/** 시각 차트와 같은 값을 화면낭독기가 탐색할 수 있는 목록으로 제공한다. */
export function ChartDataSummary({
  label,
  rows,
}: {
  label: string;
  rows: readonly string[];
}) {
  if (rows.length === 0) return null;

  return (
    <div className="sr-only" role="group" aria-label={`${label} 데이터 요약`}>
      <p>{label} 데이터 요약</p>
      <ul>
        {rows.map((row, index) => (
          <li key={`${index}:${row}`}>{row}</li>
        ))}
      </ul>
    </div>
  );
}
