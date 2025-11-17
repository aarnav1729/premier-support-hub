import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { requestOtp, verifyOtp, userEmail } = useAuth();

  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpRequested, setOtpRequested] = useState(false);
  const [serverOtp, setServerOtp] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (userEmail) {
      navigate("/tickets", { replace: true });
    }
  }, [userEmail, navigate]);

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { otp: receivedOtp } = await requestOtp(email.trim().toLowerCase());
      setOtpRequested(true);
      setServerOtp(receivedOtp);
      toast.success("OTP generated. (Shown on screen for testing)");
    } catch (err: any) {
      toast.error(err?.message || "Failed to request OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await verifyOtp(email.trim().toLowerCase(), otp.trim());
      toast.success("Login successful");
      navigate("/tickets", { replace: true });
    } catch (err: any) {
      toast.error(err?.message || "Failed to verify OTP");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl font-semibold text-center">
            SPOT – Login
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!otpRequested ? (
            <form onSubmit={handleRequestOtp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Premier Energies Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@premierenergies.com"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Requesting OTP..." : "Request OTP"}
              </Button>
              {serverOtp && (
                <p className="text-xs text-muted-foreground mt-2">
                  Dev only: OTP is{" "}
                  <span className="font-mono">{serverOtp}</span>
                </p>
              )}
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="otp">Enter OTP</Label>
                <Input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="Enter 6-digit OTP"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Verifying..." : "Verify & Login"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setOtp("");
                  setOtpRequested(false);
                  setServerOtp(null);
                }}
              >
                Change email
              </Button>
              {serverOtp && (
                <p className="text-xs text-muted-foreground mt-2">
                  Dev only: OTP is{" "}
                  <span className="font-mono">{serverOtp}</span>
                </p>
              )}
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
