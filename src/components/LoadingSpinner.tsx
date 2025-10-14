import './LoadingSpinner.css'

export const LoadingSpinner = ({ label }: { label?: string }) => (
  <div className="spinner">
    <div className="spinner__circle" aria-hidden />
    {label ? <span className="spinner__label">{label}</span> : null}
  </div>
)

export default LoadingSpinner
