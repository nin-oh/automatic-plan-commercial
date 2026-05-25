export interface SectionDividerProps {
  title?: string;
}

export default function SectionDivider({ title }: SectionDividerProps) {
  return (
    <div className="section-divider">
      <hr className="section-divider__line" />
      {title ? <h3 className="section-divider__title">{title}</h3> : null}
    </div>
  );
}
