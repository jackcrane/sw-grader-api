// Program.cs
// Build: .NET Framework 4.8, x64
// Refs (Browse):
//   SolidWorks.Interop.sldworks.dll
//   SolidWorks.Interop.swconst.dll
//
// Screenshot export uses only widely available calls:
//   1) ModelDocExtension.SaveAs(..., exportData:null)
//   2) Fallback: ModelDoc2.SaveAs3(...)
// If both fail, we log and return screenshotError.

#nullable enable

using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;

namespace SwMassPropsJson
{
    internal static class Program
    {
        [STAThread]
        private static int Main(string[] args)
        {
            Console.OutputEncoding = Encoding.UTF8;

            if (args.Length < 1)
            {
                WriteErr("Usage: SwMassPropsJson.exe <path-to-part.sldprt> [--screenshot]", 2);
                return 2;
            }

            string path = args[0];
            bool wantScreenshot = HasFlag(args, "--screenshot");

            SldWorks? swApp = null;
            ModelDoc2? doc = null;
            ModelDocExtension? ext = null;
            string? docTitle = null;

            try
            {
#pragma warning disable CA1416 // Windows-only interop — this tool targets Windows
                var swType = Type.GetTypeFromProgID("SldWorks.Application");
#pragma warning restore CA1416
                if (swType == null)
                {
                    WriteErr("SOLIDWORKS not installed (ProgID SldWorks.Application not found).", 3);
                    return 3;
                }

                swApp = (SldWorks?)Activator.CreateInstance(swType);
                if (swApp == null)
                {
                    WriteErr("Failed to start SOLIDWORKS.", 4);
                    return 4;
                }

                swApp.Visible = false;
                swApp.CommandInProgress = true; // suppress prompts where possible

                int errs = 0, warns = 0;
                doc = (ModelDoc2?)swApp.OpenDoc6(
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

                docTitle = SafeGetTitle(doc);

                ext = (ModelDocExtension?)doc.Extension;
                if (ext == null)
                {
                    WriteErr("ModelDocExtension is null.", 6);
                    return 6;
                }

                var mp = (IMassProperty?)ext.CreateMassProperty();
                if (mp == null)
                {
                    WriteErr("CreateMassProperty() returned null.", 6);
                    return 6;
                }

                // Force SI for stable outputs
                mp.UseSystemUnits = true;

                double density = mp.Density;     // kg/m^3
                double mass = mp.Mass;           // kg
                double volume = mp.Volume;       // m^3
                double area = mp.SurfaceArea;    // m^2

                // Center of mass
                double[] com = new double[] { 0.0, 0.0, 0.0 };
                try
                {
                    object comObj = mp.CenterOfMass;
                    if (comObj is double[] arr && arr.Length >= 3)
                        com = arr;
                }
                catch { /* keep defaults */ }

                // Embedded document unit system (from Document Properties > Units)
                string embeddedUnitSystem = GetEmbeddedUnitSystemSafe(doc);

                // Gather configurations
                var configurations = GetConfigurations(doc, out string activeConfigName);

                // Build configuration-aware feature tree (now includes per-sketch definition state)
                var featureTree = BuildFeatureTree(doc, configurations);

                // ----- Optional screenshot -----
                string? screenshotB64 = null;
                string? screenshotError = null;

                if (wantScreenshot)
                {
                    string tmpPng = Path.Combine(Path.GetTempPath(), $"swcap_{Guid.NewGuid():N}.png");
                    try
                    {
                        // Prep view and force redraws
                        TryQuiet(() => doc.ShowNamedView2("", (int)swStandardViews_e.swIsometricView));
                        TryQuiet(() => doc.ViewZoomtofit2());
                        TryQuiet(() => doc.ForceRebuild3(false));
                        TryQuiet(() => doc.GraphicsRedraw2());

                        // Make sure it's the active doc and visible long enough to render
                        int actErr = 0;
                        TryQuiet(() =>
                        {
                            string title = SafeGetTitle(doc);
                            swApp!.ActivateDoc3(
                                title,
                                true,
                                (int)swRebuildOnActivation_e.swUserDecision,
                                ref actErr
                            );
                        });
                        swApp.Visible = true;

                        // Small settle time can help some GPUs/remote sessions
                        Thread.Sleep(150);

                        bool ok = false;
                        int saveErr = 0, saveWarn = 0;

                        // Attempt 1: Extension.SaveAs (null exportData)
                        TryQuiet(() =>
                        {
                            ok = ext!.SaveAs(
                                tmpPng,
                                (int)swSaveAsVersion_e.swSaveAsCurrentVersion,
                                (int)swSaveAsOptions_e.swSaveAsOptions_Silent,
                                null,
                                ref saveErr,
                                ref saveWarn
                            );
                            Log($"ext.SaveAs PNG: ok={ok}, err={saveErr}, warn={saveWarn}, fileExists={File.Exists(tmpPng)}");
                        });

                        // Attempt 2: Fallback to ModelDoc2.SaveAs3
                        if ((!ok || saveErr != 0 || !File.Exists(tmpPng)))
                        {
                            TryQuiet(() =>
                            {
                                int err2 = doc.SaveAs3(
                                    tmpPng,
                                    (int)swSaveAsVersion_e.swSaveAsCurrentVersion,
                                    (int)swSaveAsOptions_e.swSaveAsOptions_Silent
                                );
                                Log($"doc.SaveAs3 PNG returned err={err2}, fileExists={File.Exists(tmpPng)}");
                            });
                        }

                        // Hide again
                        swApp.Visible = false;

                        // Validate file
                        if (!File.Exists(tmpPng))
                        {
                            screenshotError = "PNG not created (no file).";
                        }
                        else
                        {
                            byte[] pngBytes = File.ReadAllBytes(tmpPng);
                            if (pngBytes.Length == 0)
                            {
                                screenshotError = "PNG was empty.";
                            }
                            else
                            {
                                screenshotB64 = Convert.ToBase64String(pngBytes);
                            }
                        }
                    }
                    catch (Exception sx)
                    {
                        screenshotError = $"Screenshot exception: {sx.Message}";
                        Log($"Screenshot exception: {sx}");
                    }
                    finally
                    {
                        TryQuiet(() =>
                        {
                            if (File.Exists(tmpPng)) File.Delete(tmpPng);
                        });
                    }
                }

                // ----- JSON -----
                var sb = new StringBuilder();
                sb.Append('{');
                sb.Append($"\"file\":\"{Escape(path)}\",");
                sb.Append($"\"EmbeddedUnitSystem\":{Quote(embeddedUnitSystem)},");
                sb.Append($"\"density\":{density},");
                sb.Append($"\"mass\":{mass},");
                sb.Append($"\"volume\":{volume},");
                sb.Append($"\"surfaceArea\":{area},");
                sb.Append($"\"centerOfMass\":{{\"x\":{com[0]},\"y\":{com[1]},\"z\":{com[2]}}},");

                // configurations
                sb.Append("\"configurations\":{");
                sb.Append($"\"active\":{Quote(activeConfigName)},");
                sb.Append("\"all\":[");
                for (int i = 0; i < configurations.Count; i++)
                {
                    if (i > 0) sb.Append(',');
                    sb.Append(Quote(configurations[i]));
                }
                sb.Append("]},");

                // feature tree
                sb.Append("\"featureTree\":[");
                for (int i = 0; i < featureTree.Count; i++)
                {
                    if (i > 0) sb.Append(',');
                    WriteNodeJson(sb, featureTree[i]);
                }
                sb.Append(']');

                if (wantScreenshot)
                {
                    if (screenshotB64 != null)
                        sb.Append($",\"screenshotB64\":\"{screenshotB64}\"");
                    if (screenshotError != null)
                        sb.Append($",\"screenshotError\":{Quote(screenshotError)}");
                }

                sb.Append('}');
                Console.WriteLine(sb.ToString());

                return 0;
            }
            catch (Exception ex)
            {
                Log(ex.ToString());
                WriteErr(ex.ToString(), 1);
                return 1;
            }
            finally
            {
                try
                {
                    if (swApp != null)
                    {
                        try
                        {
                            if (doc != null)
                            {
                                var title = docTitle ?? SafeGetTitle(doc);
                                if (!string.IsNullOrEmpty(title))
                                {
                                    TryQuiet(() => swApp.CloseDoc(title));
                                }
                            }
                        }
                        catch (Exception e)
                        {
                            Log($"Document close wrapper exception: {e}");
                        }

                        TryQuiet(() => swApp.CommandInProgress = false);
                        TryQuiet(() => swApp.Visible = false);
                        TryQuiet(() => swApp.ExitApp());
                    }
                }
                catch (Exception e)
                {
                    Log($"Cleanup exception: {e}");
                }
                finally
                {
                    SafeReleaseCom(ext);
                    SafeReleaseCom(doc);
                    SafeReleaseCom(swApp);
                }
            }
        }



        private static string MapSketchConstrainedStatus(int raw)
        {
            // Prefer enum name -> text, but also include numeric fallbacks.
            try
            {
                var name = ((swConstrainedStatus_e)raw).ToString();
                if (name.IndexOf("Fully", StringComparison.OrdinalIgnoreCase) >= 0) return "fully-defined";
                if (name.IndexOf("Over", StringComparison.OrdinalIgnoreCase) >= 0) return "over-defined";
                if (name.IndexOf("Under", StringComparison.OrdinalIgnoreCase) >= 0) return "under-defined";
            }
            catch { /* ignore */ }

            // Conservative numeric mapping seen across versions:
            // 0: under, 1: fully, 2: over (fallback)
            return raw == 1 ? "fully-defined"
                 : raw == 2 ? "over-defined"
                 : "under-defined";
        }


        // ---------- Feature Tree structures & builders ----------

        private sealed class FeatureNode
        {
            public string name = "";
            public string type = "";
            public string path = "";         // e.g., "Boss-Extrude1/Fillet1"
            public int index;
            public bool folder;
            public string? warning = null;   // optional
            public string? error = null;     // optional
            public bool? isSketch = null;    // present when this node is a sketch
            public string? sketchState = null; // "fully-defined" | "under-defined" | "over-defined" | "unknown"
            public Dictionary<string, bool> suppressedByConfig = new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase);
            public List<FeatureNode> children = new List<FeatureNode>();
        }

        private static List<FeatureNode> BuildFeatureTree(ModelDoc2 doc, List<string> configNames)
        {
            var roots = new List<FeatureNode>();
            int index = 0;

            IFeature? f = null;
            TryQuiet(() => f = doc.FirstFeature() as IFeature);

            if (f != null)
            {
                for (var cur = f; cur != null; cur = SafeGetNextFeature(cur))
                {
                    var node = MakeNode(cur, "", ref index, configNames);
                    roots.Add(node);

                    var sub = SafeGetFirstSubFeature(cur);
                    if (sub != null)
                    {
                        TraverseSubFeatures(sub, node.path, node.children, ref index, configNames);
                    }
                }
            }

            return roots;
        }

        private static void TraverseSubFeatures(IFeature start, string parentPath, List<FeatureNode> targetList, ref int index, List<string> configNames)
        {
            for (var cur = start; cur != null; cur = SafeGetNextSubFeature(cur))
            {
                var node = MakeNode(cur, parentPath, ref index, configNames);
                targetList.Add(node);

                var sub = SafeGetFirstSubFeature(cur);
                if (sub != null)
                {
                    TraverseSubFeatures(sub, node.path, node.children, ref index, configNames);
                }
            }
        }

        private static FeatureNode MakeNode(IFeature f, string parentPath, ref int index, List<string> configNames)
        {
            var node = new FeatureNode
            {
                name = SafeGetName(f),
                type = SafeGetTypeName2(f),
                index = index++,
                folder = IsFolder(f),
            };
            node.path = string.IsNullOrEmpty(parentPath) ? node.name : $"{parentPath}/{node.name}";

            // Per-configuration suppression state
            foreach (var cfg in configNames)
            {
                bool sup = false;
                TryQuiet(() =>
                {
                    var r = f.IsSuppressed2((int)swInConfigurationOpts_e.swSpecifyConfiguration, cfg);
                    sup = Convert.ToBoolean(r);
                });
                node.suppressedByConfig[cfg] = sup;
            }

            // Optional active suppression flag annotation
            TryQuiet(() =>
            {
                if (Convert.ToBoolean(f.IsSuppressed()))
                {
                    node.warning = AppendMsg(node.warning, "suppressed-active");
                }
            });

            // ---- Sketch definition state ----
            string sketchState = "";
            bool isSketch = false;
            TryQuiet(() =>
            {
                object? spec = f.GetSpecificFeature2();
                if (spec is ISketch sk)
                {
                    isSketch = true;

                    int raw = -1;
                    TryQuiet(() => raw = sk.GetConstrainedStatus()); // returns swConstrainedStatus_e as int
                    sketchState = raw >= 0 ? MapSketchConstrainedStatus(raw) : "unknown";
                }
                else
                {
                    // Some versions still include "Sketch" in type name even if GetSpecificFeature2() != ISketch
                    var t = node.type.ToLowerInvariant();
                    if (t.Contains("sketch"))
                    {
                        isSketch = true;
                        sketchState = "unknown";
                    }
                }
            });

            if (isSketch)
            {
                node.isSketch = true;
                node.sketchState = sketchState;

                // Mirror into quick-scan tags
                if (sketchState == "under-defined")
                    node.error = AppendMsg(node.error, "sketch-underdefined");
                else if (sketchState == "over-defined")
                    node.error = AppendMsg(node.error, "sketch-overdefined");
                else if (sketchState == "fully-defined")
                    node.warning = AppendMsg(node.warning, "sketch-fully-defined");
            }

            return node;
        }

        // Best-effort late-bound invoker for boolean-returning COM methods (defensive to PIA differences)
        private static bool InvokeBoolSafely(object target, string methodName)
        {
            try
            {
                var mi = target.GetType().GetMethod(methodName);
                if (mi == null) return false;
                var result = mi.Invoke(target, null);
                return Convert.ToBoolean(result);
            }
            catch
            {
                return false;
            }
        }

        private static string AppendMsg(string? current, string add)
        {
            if (string.IsNullOrEmpty(current)) return add;
            return current + "," + add;
        }

        private static bool IsFolder(IFeature f)
        {
            string t = SafeGetTypeName2(f);
            if (string.IsNullOrEmpty(t)) return false;
            t = t.ToLowerInvariant();
            return t.Contains("folder");
        }

        private static string SafeGetName(IFeature f)
        {
            try { return f.Name ?? ""; } catch { return ""; }
        }

        private static string SafeGetTypeName2(IFeature f)
        {
            try { return f.GetTypeName2() ?? ""; } catch { return ""; }
        }

        private static IFeature? SafeGetNextFeature(IFeature f)
        {
            try { return f.GetNextFeature() as IFeature; } catch { return null; }
        }

        private static IFeature? SafeGetFirstSubFeature(IFeature f)
        {
            try { return f.GetFirstSubFeature() as IFeature; } catch { return null; }
        }

        private static IFeature? SafeGetNextSubFeature(IFeature f)
        {
            try { return f.GetNextSubFeature() as IFeature; } catch { return null; }
        }

        private static void WriteNodeJson(StringBuilder sb, FeatureNode node)
        {
            sb.Append('{');
            sb.Append($"\"name\":{Quote(node.name)},");
            sb.Append($"\"type\":{Quote(node.type)},");
            sb.Append($"\"path\":{Quote(node.path)},");
            sb.Append($"\"index\":{node.index},");
            sb.Append($"\"folder\":{(node.folder ? "true" : "false")}");

            if (!string.IsNullOrEmpty(node.warning))
                sb.Append($",\"warning\":{Quote(node.warning)}");
            if (!string.IsNullOrEmpty(node.error))
                sb.Append($",\"error\":{Quote(node.error)}");

            if (node.isSketch.HasValue && node.isSketch.Value)
            {
                sb.Append(",\"sketch\":{");
                sb.Append($"\"state\":{Quote(node.sketchState ?? "unknown")}");
                sb.Append('}');
            }

            // suppressed map
            sb.Append(",\"suppressed\":{");
            bool first = true;
            foreach (var kv in node.suppressedByConfig)
            {
                if (!first) sb.Append(',');
                first = false;
                sb.Append($"{Quote(kv.Key)}:{(kv.Value ? "true" : "false")}");
            }
            sb.Append('}');

            // children
            sb.Append(",\"children\":[");
            for (int i = 0; i < node.children.Count; i++)
            {
                if (i > 0) sb.Append(',');
                WriteNodeJson(sb, node.children[i]);
            }
            sb.Append(']');

            sb.Append('}');
        }

        private static List<string> GetConfigurations(ModelDoc2 doc, out string active)
        {
            var list = new List<string>();
            active = "";

            try
            {
                var cm = doc.ConfigurationManager;
                if (cm != null)
                {
                    var ac = cm.ActiveConfiguration;
                    if (ac != null) active = ac.Name ?? "";
                }
            }
            catch { /* ignore */ }

            try
            {
                object namesObj = doc.GetConfigurationNames();
                if (namesObj is object[] arr)
                {
                    foreach (var o in arr)
                    {
                        if (o is string s && !string.IsNullOrEmpty(s))
                            list.Add(s);
                    }
                }
            }
            catch { /* ignore */ }

            if (list.Count == 0 && !string.IsNullOrEmpty(active))
                list.Add(active);

            if (!string.IsNullOrEmpty(active))
            {
                var act = active; // copy to local to satisfy lambda rule
                list.RemoveAll(s => s.Equals(act, StringComparison.OrdinalIgnoreCase));
                list.Insert(0, act);
            }

            return list;
        }

        // ---------- helpers ----------

        private static void TryQuiet(Action a)
        {
            try { a(); } catch (Exception e) { Log($"TryQuiet caught: {e.Message}"); }
        }

        private static string SafeGetTitle(ModelDoc2 doc)
        {
            try { return doc.GetTitle() ?? ""; } catch { return ""; }
        }

        private static void SafeReleaseCom(object? comObj)
        {
#pragma warning disable CA1416 // Windows-only interop — this tool targets Windows
            try
            {
                if (comObj != null && Marshal.IsComObject(comObj))
                    Marshal.FinalReleaseComObject(comObj);
            }
            catch { /* ignore */ }
#pragma warning restore CA1416
        }

        private static string GetEmbeddedUnitSystemSafe(ModelDoc2 doc)
        {
            try
            {
                object unitsObj = doc.GetUnits();
                if (unitsObj is object[] u && u.Length >= 1)
                {
                    int lengthUnit = Convert.ToInt32(u[0]); // swLengthUnit_e

                    switch (lengthUnit)
                    {
                        case (int)swLengthUnit_e.swMETER:
                            return "MKS";
                        case (int)swLengthUnit_e.swCM:
                            return "CGS";
                        case (int)swLengthUnit_e.swMM:
                            return "MMGS";
                        case (int)swLengthUnit_e.swINCHES:
                        case (int)swLengthUnit_e.swFEET:
                        case (int)swLengthUnit_e.swFEETINCHES:
                            return "IPS";
                        default:
                            return "Custom";
                    }
                }
            }
            catch
            {
                // ignore and fall through
            }
            return "Unknown";
        }

        private static bool HasFlag(string[] args, string flag)
        {
            for (int i = 1; i < args.Length; i++)
                if (string.Equals(args[i], flag, StringComparison.OrdinalIgnoreCase))
                    return true;
            return false;
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
            return s.Replace("\\", "\\\\")
                    .Replace("\"", "\\\"")
                    .Replace("\r", "\\r")
                    .Replace("\n", "\\n");
        }

        private static void Log(string msg)
        {
            try
            {
                string exeDir = AppDomain.CurrentDomain.BaseDirectory;
                string logPath = Path.Combine(exeDir, "SwMassPropsJson.log");
                File.AppendAllText(logPath, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {msg}\r\n", Encoding.UTF8);
            }
            catch { /* ignore logging failures */ }
        }
    }
}
