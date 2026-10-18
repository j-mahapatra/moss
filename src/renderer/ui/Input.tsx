import { forwardRef, type InputHTMLAttributes } from 'react'
import { cx } from './cx'
import './Input.css'

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  /** Use the monospace face, for URLs, header names and values. */
  mono?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { mono = false, className, ...rest },
  ref
) {
  return (
    <input
      ref={ref}
      className={cx('moss-input', mono && 'moss-input--mono', className)}
      {...rest}
    />
  )
})
