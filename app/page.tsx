import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Database, Upload, Layers, BarChart } from 'lucide-react';

export default function Home() {
  const features = [
    {
      icon: Upload,
      title: 'Multi-format Upload',
      description: 'Support for CSV, TXT, QML, JSON, and XML earthquake catalogue formats.'
    },
    {
      icon: Database,
      title: 'Schema Normalization',
      description: 'Automatically map field names from different formats to a standardized schema.'
    },
    {
      icon: Layers,
      title: 'Catalogue Merging',
      description: 'Merge catalogues using configurable rules for matching events by time and location.'
    },
    {
      icon: BarChart,
      title: 'Data Visualization',
      description: 'Visualize earthquake data with interactive maps and charts.'
    }
  ];

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="py-20 md:py-32 bg-gradient-to-br from-background via-background to-muted">
        <div className="container mx-auto px-4 md:px-6">
          <div className="flex flex-col items-center justify-center text-center space-y-6 md:space-y-8">
            <div className="space-y-2">
              <h1 className="text-3xl md:text-5xl font-bold tracking-tighter">
                Earthquake Catalogue Integration Platform
              </h1>
              <p className="text-xl text-muted-foreground max-w-[700px] mx-auto">
                A comprehensive solution for researchers and agencies to upload, validate, parse, and store earthquake catalogues.
              </p>
            </div>
            <div className="space-x-4">
              <Button asChild size="lg" className="animate-pulse">
                <Link href="/upload">
                  Get Started
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/dashboard">
                  View Dashboard
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 md:py-24 bg-card">
        <div className="container mx-auto px-4 md:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tighter">Key Features</h2>
            <p className="text-muted-foreground mt-2 text-lg">
              Powerful tools for earthquake data management
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => (
              <div 
                key={index} 
                className="flex flex-col items-center p-6 bg-background rounded-lg border transition-all duration-300 hover:shadow-md hover:border-primary/50"
              >
                <div className="p-3 rounded-full bg-primary/10 mb-4">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground text-center">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 md:py-24 bg-primary text-primary-foreground">
        <div className="container mx-auto px-4 md:px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tighter mb-4">
            Ready to Streamline Your Earthquake Data Management?
          </h2>
          <p className="text-lg mb-8 opacity-90 max-w-[700px] mx-auto">
            Join researchers and agencies worldwide using our platform for efficient earthquake catalogue integration.
          </p>
          <Button asChild size="lg" variant="secondary">
            <Link href="/upload">
              Upload Your First Catalogue
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}