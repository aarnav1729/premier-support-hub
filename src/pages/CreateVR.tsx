import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function CreateVR() {
  const { userEmail } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    numberOfPeople: 1,
    employeeOrGuest: "employee" as "employee" | "guest",
    names: [""],
    pickupDateTime: "",
    dropDateTime: "",
    contactNumber: "",
    purposeOfVisit: "",
    description: "",
  });

  const handleNumberOfPeopleChange = (value: string) => {
    const num = parseInt(value);
    setFormData({
      ...formData,
      numberOfPeople: num,
      names: Array(num).fill(""),
    });
  };

  const handleNameChange = (index: number, value: string) => {
    const newNames = [...formData.names];
    newNames[index] = value;
    setFormData({ ...formData, names: newNames });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.names.some((name) => !name.trim())) {
      toast.error("Please enter all names");
      return;
    }

    if (!formData.pickupDateTime || !formData.dropDateTime || !formData.contactNumber || !formData.purposeOfVisit) {
      toast.error("Please fill all required fields");
      return;
    }

    setLoading(true);
    try {
      const { data: empData } = await supabase
        .from("emp")
        .select("empid")
        .eq("empemail", userEmail)
        .single();

      if (!empData) {
        toast.error("Employee record not found");
        return;
      }

      const { error } = await supabase.from("vr").insert({
        empid: empData.empid,
        number_of_people: formData.numberOfPeople,
        employee_or_guest: formData.employeeOrGuest,
        names: formData.names,
        pickup_datetime: new Date(formData.pickupDateTime).toISOString(),
        drop_datetime: new Date(formData.dropDateTime).toISOString(),
        contact_number: formData.contactNumber,
        purpose_of_visit: formData.purposeOfVisit,
        description: formData.description,
        user_email: userEmail,
        assignee_email: "krishnaiah.donta@premierenergies.com",
        status: "pending",
      });

      if (error) throw error;

      toast.success("Vehicle Request created successfully!");
      navigate("/tickets");
    } catch (error) {
      console.error("Error creating vehicle request:", error);
      toast.error("Failed to create request");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <Card>
        <CardHeader>
          <CardTitle>Create Vehicle Request</CardTitle>
          <CardDescription>Request a vehicle for transportation</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="numberOfPeople">Number of People *</Label>
                <Input
                  id="numberOfPeople"
                  type="number"
                  min={1}
                  max={20}
                  value={formData.numberOfPeople}
                  onChange={(e) => handleNumberOfPeopleChange(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="employeeOrGuest">Type *</Label>
                <Select
                  value={formData.employeeOrGuest}
                  onValueChange={(value: "employee" | "guest") => setFormData({ ...formData, employeeOrGuest: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">Employee</SelectItem>
                    <SelectItem value="guest">Guest</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Names *</Label>
              <div className="space-y-2">
                {formData.names.map((name, index) => (
                  <Input
                    key={index}
                    value={name}
                    onChange={(e) => handleNameChange(index, e.target.value)}
                    placeholder={`Person ${index + 1} name`}
                  />
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pickupDateTime">Pickup Date & Time *</Label>
                <Input
                  id="pickupDateTime"
                  type="datetime-local"
                  value={formData.pickupDateTime}
                  onChange={(e) => setFormData({ ...formData, pickupDateTime: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dropDateTime">Drop Date & Time *</Label>
                <Input
                  id="dropDateTime"
                  type="datetime-local"
                  value={formData.dropDateTime}
                  onChange={(e) => setFormData({ ...formData, dropDateTime: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="contactNumber">Contact Number *</Label>
              <Input
                id="contactNumber"
                type="tel"
                value={formData.contactNumber}
                onChange={(e) => setFormData({ ...formData, contactNumber: e.target.value })}
                placeholder="+91 XXXXXXXXXX"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="purposeOfVisit">Purpose of Visit *</Label>
              <Textarea
                id="purposeOfVisit"
                value={formData.purposeOfVisit}
                onChange={(e) => setFormData({ ...formData, purposeOfVisit: e.target.value })}
                placeholder="Describe the purpose of this vehicle request..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Additional Details</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Any additional information..."
                rows={3}
              />
            </div>

            <div className="flex gap-4">
              <Button type="submit" disabled={loading} className="flex-1">
                {loading ? "Creating..." : "Create Request"}
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate("/tickets")}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </Layout>
  );
}