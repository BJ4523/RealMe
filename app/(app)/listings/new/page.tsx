import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/shared/page-header";
import { ListingForm } from "@/components/listings/listing-form";
import { UrlImport } from "@/components/listings/url-import";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default async function NewListingPage() {
  await requireUser();

  return (
    <>
      <PageHeader
        title="Add a listing"
        description="Paste a Zillow/Redfin/Realtor link to auto-import all the photos — or switch to manual entry."
      />
      <Card className="rounded-3xl">
        <CardContent className="pt-6">
          {/* URL import is the default; manual entry is the fallback. */}
          <Tabs defaultValue="url">
            <TabsList className="rounded-full">
              <TabsTrigger value="url" className="rounded-full">
                Import from URL
              </TabsTrigger>
              <TabsTrigger value="manual" className="rounded-full">
                Manual entry
              </TabsTrigger>
            </TabsList>
            <TabsContent value="url" className="mt-6">
              <UrlImport />
            </TabsContent>
            <TabsContent value="manual" className="mt-6">
              <ListingForm source="manual" />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </>
  );
}
