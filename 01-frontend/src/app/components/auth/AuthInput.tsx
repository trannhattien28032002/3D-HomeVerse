/**
 * Ô input có icon Material Symbols ở trái, dùng chung cho form auth.
 * Hỗ trợ một node phụ bên phải label (vd: link "Forgot Password?").
 */
import type { InputHTMLAttributes, ReactNode } from "react";

interface AuthInputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** id + htmlFor để gắn label với input. */
  id: string;
  /** Nhãn hiển thị phía trên ô input. */
  label: string;
  /** Tên icon Material Symbols hiển thị bên trái (vd: "mail", "key"). */
  icon: string;
  /** Node phụ căn phải hàng label (vd: link quên mật khẩu). */
  labelTrailing?: ReactNode;
}

export default function AuthInput({ id, label, icon, labelTrailing, ...inputProps }: AuthInputProps) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center px-1">
        <label className="font-label-lg text-label-lg text-on-surface" htmlFor={id}>
          {label}
        </label>
        {labelTrailing}
      </div>
      <div className="relative group">
        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors">
          {icon}
        </span>
        <input
          id={id}
          className="w-full pl-12 pr-4 py-4 bg-surface-container-lowest border border-outline-variant/60 rounded-xl focus:ring-2 focus:ring-primary-container/20 focus:border-primary-container transition-all shadow-sm placeholder:text-outline/60 font-body-md outline-none"
          {...inputProps}
        />
      </div>
    </div>
  );
}
