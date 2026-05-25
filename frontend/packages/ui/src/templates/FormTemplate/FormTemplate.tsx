import Icon from '../../atoms/Icon/Icon';
export interface FormTemplateProps {
  title: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  onClose: () => void;
}
export default function FormTemplate({ title, footer, children, onClose }: FormTemplateProps) {
  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal__header">
          <h2 className="modal__title">{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fermer"><Icon name="close" /></button>
        </div>
        <div className="modal__body">{children}</div>
        {footer ? <div className="modal__footer">{footer}</div> : null}
      </div>
    </div>
  );
}
