import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const API_BASE_URL = window.location.origin;

// Attachments will be stored as JSON in MSSQL (NVARCHAR(MAX))
type AttachmentPayload = {
  name: string;
  size: number;
  type: string;
  dataUrl: string; // base64 data URL
};

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB per file
const MAX_FILES = 5;

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
  const [attachments, setAttachments] = useState<AttachmentPayload[]>([]);

  React.useEffect(() => {
    if (!userEmail) {
      navigate("/login", { replace: true });
    }
  }, [userEmail, navigate]);

  const handleNumberOfPeopleChange = (value: string) => {
    const num = parseInt(value, 10);
    const safeNum = Number.isNaN(num) || num < 1 ? 1 : Math.min(num, 50);
    setFormData((prev) => ({
      ...prev,
      numberOfPeople: safeNum,
      names: Array(safeNum).fill(""),
    }));
  };

  const handleNameChange = (index: number, value: string) => {
    const newNames = [...formData.names];
    newNames[index] = value;
    setFormData((prev) => ({ ...prev, names: newNames }));
  };

  const handleAttachmentsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) {
      setAttachments([]);
      return;
    }

    const fileArray = Array.from(files).slice(0, MAX_FILES);
    const oversized = fileArray.find((f) => f.size > MAX_FILE_SIZE_BYTES);
    if (oversized) {
      toast.error(
        `File "${oversized.name}" is larger than 10 MB. Please choose smaller files.`
      );
      e.target.value = "";
      return;
    }

    Promise.all<AttachmentPayload>(
      fileArray.map(
        (file) =>
          new Promise<AttachmentPayload>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result;
              resolve({
                name: file.name,
                size: file.size,
                type: file.type,
                dataUrl: typeof result === "string" ? result : "",
              });
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
          })
      )
    )
      .then((payloads) => {
        setAttachments(payloads);
      })
      .catch((err) => {
        console.error("Error reading attachments:", err);
        toast.error("Failed to process attachments");
        setAttachments([]);
      });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!userEmail) {
      toast.error("You must be logged in to create a request");
      navigate("/login", { replace: true });
      return;
    }

    if (formData.names.some((name) => !name.trim())) {
      toast.error("Please enter all names");
      return;
    }

    if (
      !formData.pickupDateTime ||
      !formData.dropDateTime ||
      !formData.contactNumber ||
      !formData.purposeOfVisit
    ) {
      toast.error("Please fill all required fields");
      return;
    }

    const pickup = new Date(formData.pickupDateTime);
    const drop = new Date(formData.dropDateTime);
    if (pickup >= drop) {
      toast.error("Drop time must be after pickup time");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        number_of_people: formData.numberOfPeople,
        employee_or_guest: formData.employeeOrGuest,
        names: formData.names,
        pickup_datetime: pickup.toISOString(),
        drop_datetime: drop.toISOString(),
        contact_number: formData.contactNumber,
        purpose_of_visit: formData.purposeOfVisit,
        description: formData.description,
        attachments: attachments.length > 0 ? attachments : undefined,
      };

      const res = await fetch(`${API_BASE_URL}/api/vr`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let message = "Failed to create request";
        try {
          const data = await res.json();
          if (data && data.error) {
            message = data.error;
          }
        } catch {
          // ignore JSON parse errors
        }
        toast.error(message);
        return;
      }

      toast.success("Vehicle Request created successfully!");
      navigate("/tickets");
    } catch (error) {
      console.error("Error creating vehicle request:", error);
      toast.error("Failed to create request");
    } finally {
      setLoading(false);
    }
  };

  if (!userEmail) {
    return null;
  }

  return (
    <Layout>
      <Card>
        <CardHeader>
          <CardTitle>Create Vehicle Request</CardTitle>
          <CardDescription>
            Request a vehicle for transportation
          </CardDescription>
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
                  max={50}
                  value={formData.numberOfPeople}
                  onChange={(e) => handleNumberOfPeopleChange(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="employeeOrGuest">Type *</Label>
                <Select
                  value={formData.employeeOrGuest}
                  onValueChange={(value: "employee" | "guest") =>
                    setFormData((prev) => ({
                      ...prev,
                      employeeOrGuest: value,
                    }))
                  }
                >
                  <SelectTrigger id="employeeOrGuest">
                    <SelectValue placeholder="Select type" />
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
                <Label htmlFor="pickupDateTime">Pickup Date &amp; Time *</Label>
                <Input
                  id="pickupDateTime"
                  type="datetime-local"
                  value={formData.pickupDateTime}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      pickupDateTime: e.target.value,
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dropDateTime">Drop Date &amp; Time *</Label>
                <Input
                  id="dropDateTime"
                  type="datetime-local"
                  value={formData.dropDateTime}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      dropDateTime: e.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="contactNumber">Contact Number *</Label>
              <Input
                id="contactNumber"
                type="tel"
                value={formData.contactNumber}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    contactNumber: e.target.value,
                  }))
                }
                placeholder="+91 XXXXXXXXXX"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="purposeOfVisit">Purpose of Visit *</Label>
              <Textarea
                id="purposeOfVisit"
                value={formData.purposeOfVisit}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    purposeOfVisit: e.target.value,
                  }))
                }
                placeholder="Describe the purpose of this vehicle request..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Additional Details</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                placeholder="Any additional information..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="attachments">Attachments (optional)</Label>
              <Input
                id="attachments"
                type="file"
                multiple
                onChange={handleAttachmentsChange}
              />
              <p className="text-xs text-muted-foreground">
                You can upload up to {MAX_FILES} files, max 10 MB each (images,
                PDFs, etc.). Files are stored securely with the request.
              </p>
              {attachments.length > 0 && (
                <ul className="mt-1 text-xs text-muted-foreground list-disc list-inside">
                  {attachments.map((att) => (
                    <li key={att.name}>
                      {att.name} ({Math.round(att.size / 1024)} KB)
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex gap-4">
              <Button type="submit" disabled={loading} className="flex-1">
                {loading ? "Creating..." : "Create Request"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/tickets")}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </Layout>
  );
}
