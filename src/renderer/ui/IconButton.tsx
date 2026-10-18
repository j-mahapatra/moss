import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cx } from './cx'
import './IconButton.css'

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> & {
  /** Accessible name; also shown as the tooltip. */
  label: string
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, className, type = 'button', title, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={title ?? label}
      className={cx('moss-icon-button', className)}
      {...rest}
    />
  )
})
