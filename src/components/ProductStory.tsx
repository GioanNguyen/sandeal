import type { Story } from "@/lib/productstory";
import { Icon } from "./Icon";

/** Đoạn "Nhận xét giá" (part="text") và "Câu hỏi thường gặp" (part="faq") – chữ viết từ số liệu của chính món */
export function ProductStory({ story, part }: { story: Story; part: "text" | "faq" }) {
  if (part === "text") {
    if (!story.paragraphs.length) return null;
    return (
      <section className="panel story" aria-labelledby="story-head">
        <h2 id="story-head"><Icon name="info" /> {story.heading}</h2>
        {story.paragraphs.map((t, i) => <p key={i}>{t}</p>)}
      </section>
    );
  }
  if (!story.faqs.length) return null;
  return (
    <section className="panel faq" aria-labelledby="faq-head">
      <h2 id="faq-head"><Icon name="help" /> Câu hỏi thường gặp</h2>
      {story.faqs.map((f, i) => (
        <details key={i} open={i === 0}>
          <summary>{f.q}</summary>
          <p>{f.a}</p>
        </details>
      ))}
    </section>
  );
}
