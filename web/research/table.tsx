import type { ReactNode } from "react";
export function ResearchTable({
  caption,
  headers,
  rows,
}: {
  caption: string;
  headers: string[];
  rows: { id: string; cells: ReactNode[] }[];
}) {
  return (
    <div className="research-table-scroll">
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              {r.cells.map((c, i) => (
                <td key={headers[i]}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p>No recorded rows in this selection.</p>}
    </div>
  );
}
