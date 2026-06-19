/**
 * Trang đăng nhập.
 * Dùng lại AuthLayout (khung chia đôi màn hình) + AuthInput, và tách riêng
 * GoogleSignInButton thành component độc lập.
 */
import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuthLayout, AuthInput, GoogleSignInButton } from "src/app/components/auth";
import { supabase } from "src/data/auth/supabaseClient";
import { signInWithGoogle } from "src/data/auth/oauth";

type LocationState = { returnTo?: string } | null;

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = (location.state as LocationState)?.returnTo ?? "/projects";

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError("Email hoặc mật khẩu không đúng.");
        return;
      }
      navigate(returnTo, { replace: true });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (googleBusy) return;
    setError(null);
    setGoogleBusy(true);
    // Thành công → trình duyệt redirect đi (không quay lại đây). Chỉ tới nhánh dưới khi lỗi.
    const { error: oauthError } = await signInWithGoogle(`${window.location.origin}${returnTo}`);
    if (oauthError) {
      setError("Đăng nhập với Google chưa khả dụng. Vui lòng dùng email và mật khẩu.");
      setGoogleBusy(false);
    }
  };

  return (
    <AuthLayout
      badgeIcon="home"
      title="Welcome Home"
      subtitle="Enter the threshold of your sanctuary"
    >
      <form className="space-y-5" onSubmit={handleSubmit}>
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
          placeholder="The secret passage..."
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          labelTrailing={
            <Link
              to="/forgot-password"
              className="font-label-sm text-label-sm text-primary hover:text-on-primary-fixed-variant transition-colors"
            >
              Forgot Password?
            </Link>
          }
        />

        {error && (
          <p className="font-label-sm text-label-sm text-error -mt-2 ml-1">{error}</p>
        )}

        <div className="pt-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-4 px-6 bg-primary-container text-on-primary-container font-headline-sm text-headline-sm rounded-lg shadow-[0_8px_20px_rgba(var(--rgb-primary-container),0.2)] hover:shadow-[0_12px_30px_rgba(var(--rgb-primary-container),0.4)] hover:scale-[1.01] active:scale-[0.99] transition-all duration-300 flex items-center justify-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            {isSubmitting ? "Entering..." : "Enter the Sanctuary"}
            <span className="material-symbols-outlined">login</span>
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

        {/* Nút đăng nhập Google — cần bật Google provider trên Supabase dashboard mới chạy thật. */}
        <GoogleSignInButton onClick={handleGoogleSignIn} disabled={isSubmitting || googleBusy} />

        <p className="font-body-md text-body-md text-on-surface-variant text-center">
          New to the realm?{" "}
          <Link
            to="/register"
            className="text-primary font-bold hover:underline decoration-primary-container/50 decoration-2 underline-offset-4"
          >
            Join the Guild
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
