/**
 * Trang đăng ký.
 * Cùng phong cách với LoginPage (dùng chung AuthLayout / AuthInput /
 * GoogleSignInButton), thêm các trường tên & xác nhận mật khẩu.
 *
 * Flow (D1): gọi backend POST /auth/register (admin tạo user, pre-seed
 * profiles) → 201 → tự signInWithPassword để lấy session → redirect.
 * Backend không trả token nên signInWithPassword là bước bắt buộc sau register.
 */
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout, AuthInput, GoogleSignInButton } from "src/app/components/auth";
import { register } from "src/data/auth/authApi";
import { ApiError } from "src/data/api/client";
import { supabase } from "src/data/auth/supabaseClient";
import { signInWithGoogle } from "src/data/auth/oauth";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  const navigate = useNavigate();

  const passwordsMismatch =
    confirmPassword.length > 0 && password !== confirmPassword;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (passwordsMismatch || isSubmitting) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await register({ email, password, displayName: name || undefined });

      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        // Tài khoản đã tạo thành công nhưng auto-login thất bại — đưa người dùng
        // sang trang login để tự đăng nhập thay vì kẹt lại đây.
        navigate("/login", { replace: true });
        return;
      }
      navigate("/projects", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError("Email này đã được đăng ký.");
      } else if (err instanceof ApiError && err.status === 422) {
        setError(err.message || "Thông tin đăng ký không hợp lệ.");
      } else {
        setError("Đăng ký thất bại. Vui lòng thử lại.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignUp = async () => {
    if (googleBusy) return;
    setError(null);
    setGoogleBusy(true);
    // Thành công → trình duyệt redirect đi. Chỉ tới nhánh dưới khi lỗi (vd provider chưa bật).
    const { error: oauthError } = await signInWithGoogle();
    if (oauthError) {
      setError("Đăng ký với Google chưa khả dụng. Vui lòng dùng email và mật khẩu.");
      setGoogleBusy(false);
    }
  };

  return (
    <AuthLayout
      badgeIcon="cottage"
      title="Join the Guild"
      subtitle="Carve your name into the founding stone"
    >
      <form className="space-y-5" onSubmit={handleSubmit}>
        <AuthInput
          id="name"
          name="name"
          type="text"
          label="Name"
          icon="person"
          placeholder="Your chosen title..."
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <AuthInput
          id="email"
          name="email"
          type="email"
          label="Email"
          icon="mail"
          placeholder="Scribe your address..."
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <AuthInput
          id="password"
          name="password"
          type="password"
          label="Password"
          icon="key"
          placeholder="Forge a secret passage..."
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <div>
          <AuthInput
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            label="Confirm Password"
            icon="lock"
            placeholder="Repeat the secret passage..."
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          {passwordsMismatch && (
            <p className="font-label-sm text-label-sm text-error mt-2 ml-1">
              The passages do not match.
            </p>
          )}
        </div>

        {error && (
          <p className="font-label-sm text-label-sm text-error -mt-2 ml-1">{error}</p>
        )}

        <div className="pt-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-4 px-6 bg-primary-container text-on-primary-container font-headline-sm text-headline-sm rounded-lg shadow-[0_8px_20px_rgba(248,180,0,0.2)] hover:shadow-[0_12px_30px_rgba(248,180,0,0.4)] hover:scale-[1.01] active:scale-[0.99] transition-all duration-300 flex items-center justify-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            {isSubmitting ? "Founding..." : "Found Your Home"}
            <span className="material-symbols-outlined">add_home</span>
          </button>
        </div>
      </form>

      <div className="mt-6 flex flex-col items-center gap-4">
        {/* Dải phân cách "or" */}
        <div className="flex items-center w-full gap-4">
          <div className="h-px flex-grow bg-outline-variant/30" />
          <span className="font-label-sm text-label-sm text-outline uppercase tracking-widest opacity-60">
            or
          </span>
          <div className="h-px flex-grow bg-outline-variant/30" />
        </div>

        {/* Nút đăng ký Google — cần bật Google provider trên Supabase dashboard mới chạy thật. */}
        <GoogleSignInButton onClick={handleGoogleSignUp} label="Sign up with Google" disabled={isSubmitting || googleBusy} />

        <p className="font-body-md text-body-md text-on-surface-variant text-center">
          Already a dweller?{" "}
          <Link
            to="/login"
            className="text-primary font-bold hover:underline decoration-primary-container/50 decoration-2 underline-offset-4"
          >
            Return Home
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
