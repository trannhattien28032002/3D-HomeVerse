/**
 * Nút "Đăng nhập với Google" — tách riêng thành component độc lập để có thể
 * tái sử dụng ở cả trang đăng nhập lẫn đăng ký, và cô lập phần logic OAuth
 * Google khỏi form chính.
 *
 * Hiện `onClick` được truyền từ ngoài; phần wiring OAuth thực tế (redirect /
 * popup) sẽ gắn sau ở tầng service.
 */
interface GoogleSignInButtonProps {
  /** Handler khi bấm nút (khởi tạo flow OAuth Google). */
  onClick?: () => void;
  /** Nhãn nút, mặc định cho ngữ cảnh đăng nhập. */
  label?: string;
  /** Vô hiệu hóa nút (vd: trong lúc đang xử lý). */
  disabled?: boolean;
}

/** Logo Google chính thức (multicolor "G"). */
function GoogleLogo() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export default function GoogleSignInButton({
  onClick,
  label = "Continue with Google",
  disabled = false,
}: GoogleSignInButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full py-4 px-6 bg-surface-container-lowest text-on-surface font-label-lg text-label-lg border border-outline-variant/60 rounded-lg shadow-sm hover:bg-surface-variant/50 hover:shadow-md active:scale-[0.99] transition-all duration-300 flex items-center justify-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed"
    >
      <GoogleLogo />
      {label}
    </button>
  );
}
