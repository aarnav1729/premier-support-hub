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
  // NOTE: spelling aligned with backend (getMEPAssigneeEmail) which uses "Kothu-WH"
  "Kothur-WH",
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

// Attachments will be stored as JSON in MSSQL (NVARCHAR(MAX))
type AttachmentPayload = {
  name: string;
  size: number;
  type: string;
  dataUrl: string; // base64 data URL
};

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB per file
const MAX_FILES = 5;

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
  const [attachments, setAttachments] = useState<AttachmentPayload[]>([]);

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

    if (
      !formData.location ||
      !formData.category ||
      !formData.areaOfWork ||
      !formData.description
    ) {
      toast.error("Please fill all required fields");
      return;
    }

    if (formData.category === "Others" && !formData.customCategory.trim()) {
      toast.error("Please specify the category for 'Others'");
      return;
    }

    if (!userEmail) {
      toast.error("You must be logged in to create a request");
      return;
    }

    const category =
      formData.category === "Others"
        ? formData.customCategory.trim()
        : formData.category;

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/mep`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          location: formData.location,
          category,
          area_of_work: formData.areaOfWork,
          description: formData.description,
          attachments: attachments.length > 0 ? attachments : undefined,
        }),
      });

      if (!res.ok) {
        let message = "Failed to create request";
        try {
          const data = await res.json();
          if (data && data.error) {
            message = data.error;
          }
        } catch {
          // ignore JSON parse errors, keep default message
        }
        toast.error(message);
        return;
      }

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
          <CardDescription>
            Submit a new maintenance, electrical, or plumbing request
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="location">Location *</Label>
                <Select
                  value={formData.location}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, location: value }))
                  }
                >
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
                <Select
                  value={formData.category}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, category: value }))
                  }
                >
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
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      customCategory: e.target.value,
                    }))
                  }
                  placeholder="Enter custom category"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="areaOfWork">Area of Work *</Label>
              <Input
                id="areaOfWork"
                value={formData.areaOfWork}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    areaOfWork: e.target.value,
                  }))
                }
                placeholder="E.g., Main office building, 2nd floor"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description *</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                placeholder="Provide detailed description of the issue..."
                rows={5}
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
