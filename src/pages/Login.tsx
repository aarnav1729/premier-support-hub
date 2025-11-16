import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Ticket } from "lucide-react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [generatedOtp, setGeneratedOtp] = useState("");
  const [showOtp, setShowOtp] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

  const handleSendOTP = async () => {
    if (!email.endsWith("@premierenergies.com")) {
      toast.error("Please use a valid @premierenergies.com email address");
      return;
    }

    setLoading(true);
    try {
      const newOtp = generateOTP();
      setGeneratedOtp(newOtp);

      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 10);

      await supabase.from("otp_codes").insert({
        email,
        otp: newOtp,
        expires_at: expiresAt.toISOString(),
      });

      setShowOtp(true);
      toast.success(`OTP Generated: ${newOtp}`, {
        description: "Use this code to login",
        duration: 10000,
      });
    } catch (error) {
      toast.error("Failed to generate OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (otp !== generatedOtp) {
      toast.error("Invalid OTP");
      return;
    }

    setLoading(true);
    try {
      // Check if employee exists
      const { data: empData, error: empError } = await supabase
        .from("emp")
        .select("*")
        .eq("empemail", email)
        .single();

      if (empError || !empData) {
        // Create new employee record
        await supabase.from("emp").insert({
          empemail: email,
          activeflag: true,
        });
      }

      // Mark OTP as used
      await supabase
        .from("otp_codes")
        .update({ used: true })
        .eq("email", email)
        .eq("otp", otp);

      login(email);
      toast.success("Login successful!");
      navigate("/tickets");
    } catch (error) {
      toast.error("Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-primary rounded-full">
              <Ticket className="h-8 w-8 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Premier Energies</CardTitle>
          <CardDescription>Ticketing System Login</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              placeholder="yourname@premierenergies.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={showOtp}
            />
          </div>

          {!showOtp ? (
            <Button onClick={handleSendOTP} disabled={loading} className="w-full">
              {loading ? "Generating OTP..." : "Generate OTP"}
            </Button>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="otp">Enter OTP</Label>
                <Input
                  id="otp"
                  type="text"
                  placeholder="Enter 6-digit OTP"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  maxLength={6}
                />
              </div>
              <Button onClick={handleVerifyOTP} disabled={loading} className="w-full">
                {loading ? "Verifying..." : "Verify OTP"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowOtp(false);
                  setOtp("");
                  setGeneratedOtp("");
                }}
                className="w-full"
              >
                Use Different Email
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}