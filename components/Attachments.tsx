import { formatFileSize } from "@/lib/format";

export type AttachmentView = {
  id: number;
  file_name: string;
  content_type: string;
  size: number;
  url: string | null;
  isImage: boolean;
};

export function Attachments({ items }: { items: AttachmentView[] }) {
  if (items.length === 0) return null;

  const images = items.filter((a) => a.isImage && a.url);

  return (
    <>
      <ul className="attach-list">
        {items.map((a) => (
          <li key={a.id}>
            {a.url ? (
              <a href={a.url} target="_blank" rel="noreferrer">
                {a.file_name}
              </a>
            ) : (
              <span className="dim">{a.file_name}</span>
            )}
            <span className="dim"> · {formatFileSize(a.size)}</span>
          </li>
        ))}
      </ul>

      {images.length > 0 && (
        <div className="thumbs">
          {images.map((a) => (
            <a key={a.id} href={a.url!} target="_blank" rel="noreferrer">
              {/* 서명 URL이라 next/image 최적화 대상이 아니다 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.url!} alt={a.file_name} />
            </a>
          ))}
        </div>
      )}
    </>
  );
}
