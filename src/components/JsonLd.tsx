/** Chèn dữ liệu có cấu trúc (schema.org) – chống chèn thẻ </script> bằng cách thoát dấu < */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
