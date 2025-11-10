// Program.cs
// Build: .NET Framework 4.8, x64
// Add References (Browse):
//   SolidWorks.Interop.sldworks.dll
//   SolidWorks.Interop.swconst.dll
// Usually in: C:\Program Files\SOLIDWORKS Corp\SOLIDWORKS\api\redist\

using System;
using System.Text;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;

namespace SwMassPropsJson
{
    internal static class Program
    {
        [STAThread] // COM with SOLIDWORKS prefers STA
        private static int Main(string[] args)
        {
            Console.OutputEncoding = Encoding.UTF8;

            if (args.Length < 1)
            {
                WriteErr("Usage: SwMassPropsJson.exe <path-to-part.sldprt>", 2);
                return 2;
            }

            string path = args[0];

            try
            {
                var swType = Type.GetTypeFromProgID("SldWorks.Application");
                if (swType == null)
                {
                    WriteErr("SOLIDWORKS not installed (ProgID SldWorks.Application not found).", 3);
                    return 3;
                }

                var swApp = (SldWorks)Activator.CreateInstance(swType);
                if (swApp == null)
                {
                    WriteErr("Failed to start SOLIDWORKS.", 4);
                    return 4;
                }
                swApp.Visible = false;

                int errs = 0, warns = 0;
                var doc = (ModelDoc2)swApp.OpenDoc6(
                    path,
                    (int)swDocumentTypes_e.swDocPART,
                    (int)swOpenDocOptions_e.swOpenDocOptions_Silent,
                    "",
                    ref errs,
                    ref warns
                );

                if (doc == null)
                {
                    WriteErr($"Open failed ({errs}) for: {path}", 5);
                    return 5;
                }

                var ext = (ModelDocExtension)doc.Extension;
                var mp = (IMassProperty)ext.CreateMassProperty();
                if (mp == null)
                {
                    WriteErr("CreateMassProperty() returned null.", 6);
                    return 6;
                }

                // Force SI so outputs are predictable
                mp.UseSystemUnits = true;

                // 1alars
                double density = mp.Density;      // kg/m^3
                double mass = mp.Mass;         // kg
                double volume = mp.Volume;       // m^3
                double area = mp.SurfaceArea;  // m^2

                // Center of Mass (meters)
                object comObj = mp.CenterOfMass;
                double[] com = comObj as double[] ?? new double[] { 0.0, 0.0, 0.0 };

                // Emit JSON to stdout
                string json = @"{"
                    + $"\"file\":\"{Escape(path)}\","
                    + $"\"density\":{density},"
                    + $"\"mass\":{mass},"
                    + $"\"volume\":{volume},"
                    + $"\"surfaceArea\":{area},"
                    + $"\"centerOfMass\":{{\"x\":{com[0]},\"y\":{com[1]},\"z\":{com[2]}}}"
                    + "}";

                Console.WriteLine(json);

                // Optional: close (leave SW open for reuse if you want)
                // swApp.CloseDoc(doc.GetTitle());

                return 0;
            }
            catch (Exception ex)
            {
                WriteErr(ex.ToString(), 1);
                return 1;
            }
        }

        private static void WriteErr(string message, int code)
        {
            string json = $"{{\"error\":{Quote(message)},\"code\":{code}}}";
            Console.WriteLine(json);
        }

        private static string Quote(string s) => $"\"{Escape(s)}\"";
        private static string Escape(string s)
        {
            if (string.IsNullOrEmpty(s)) return s ?? "";
            return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "\\r").Replace("\n", "\\n");
        }
    }
}
