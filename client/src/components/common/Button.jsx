export default function GlowButton({
  children,
  type = 'button',
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}) {
  return (
    <button
      type={type}
      className={`ds-ui-btn is-${variant} is-${size}${className ? ` ${className}` : ''}`}
      {...props}
    >
      {children}
    </button>
  )
}
