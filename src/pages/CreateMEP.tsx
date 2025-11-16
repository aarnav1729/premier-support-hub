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

const LOCATIONS = [
  "PEPPL",
  "PEIPL-C",
  "PEIPL-M",
  "PEGEPL-I",
  "PEGEPL-II",
  "Bhagwati-WH",
  "Axonify-WH",
  "Radiant-WH",
  "Bahadurguda-WH",
  "Kothu-WH",
];

const CATEGORIES = [
  "Electrical",
  "Mechanical",
  "Plumbing",
  "Carpentry",
  "Welding",
  "Painting",
  "Civil Works",
  "Others",
];

export default function CreateMEP() {
  const { userEmail } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    location: "",
    category: "",
    customCategory: "",
    areaOfWork: "",
    description: "",
  });

  const getAssigneeEmail = (location: string) => {
    const pepplLocations = ["PEPPL", "PEIPL-C", "Bhagwati-WH", "Axonify-WH", "Bahadurguda-WH", "Kothur-WH"];
    return pepplLocations.includes(location)
      ? "mep.peppl@premierenergies.com"
      : "mep.peipl@premierenergies.com";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.location || !formData.category || !formData.areaOfWork || !formData.description) {
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

      const assigneeEmail = getAssigneeEmail(formData.location);
      const category = formData.category === "Others" ? formData.customCategory : formData.category;

      const { error } = await supabase.from("mep").insert({
        empid: empData.empid,
        location: formData.location,
        category,
        area_of_work: formData.areaOfWork,
        description: formData.description,
        assignee_email: assigneeEmail,
        user_email: userEmail,
        status: "pending",
      });

      if (error) throw error;

      toast.success("MEP Request created successfully!");
      navigate("/tickets");
    } catch (error) {
      console.error("Error creating MEP request:", error);
      toast.error("Failed to create request");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <Card>
        <CardHeader>
          <CardTitle>Create MEP Request</CardTitle>
          <CardDescription>Submit a new maintenance, electrical, or plumbing request</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="location">Location *</Label>
                <Select value={formData.location} onValueChange={(value) => setFormData({ ...formData, location: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    {LOCATIONS.map((loc) => (
                      <SelectItem key={loc} value={loc}>
                        {loc}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Work Category *</Label>
                <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {formData.category === "Others" && (
              <div className="space-y-2">
                <Label htmlFor="customCategory">Specify Category *</Label>
                <Input
                  id="customCategory"
                  value={formData.customCategory}
                  onChange={(e) => setFormData({ ...formData, customCategory: e.target.value })}
                  placeholder="Enter custom category"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="areaOfWork">Area of Work *</Label>
              <Input
                id="areaOfWork"
                value={formData.areaOfWork}
                onChange={(e) => setFormData({ ...formData, areaOfWork: e.target.value })}
                placeholder="E.g., Main office building, 2nd floor"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description *</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Provide detailed description of the issue..."
                rows={5}
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