// ES module, named exports, arrow functions only

const IN_PER_M = 39.37007874015748; // exact via 1 m / 0.0254
const LB_PER_KG = 2.2046226218487757; // lbm per kg
const MM_PER_M = 1000;
const CM_PER_M = 100;

export const normalizeUnitSystem = (raw) => {
  const v = String(raw || "").toLowerCase();
  if (v === "ips" || v === "mmgs" || v === "mks" || v === "cgs") return v;
  return "mks"; // default (SI)
};

export const convertFromSI = (si, unitSystem) => {
  // si: { density, mass, volume, surfaceArea, centerOfMass:{x,y,z}, file }
  const { density, mass, volume, surfaceArea, centerOfMass, file } = si;
  const com = centerOfMass || { x: 0, y: 0, z: 0 };

  switch (unitSystem) {
    case "mks": {
      return {
        file,
        unitSystem,
        density,
        mass,
        volume,
        surfaceArea,
        centerOfMass: com,
        units: {
          density: "kg/m3",
          mass: "kg",
          volume: "m3",
          surfaceArea: "m2",
          centerOfMass: "m",
        },
      };
    }
    case "mmgs": {
      // kg/m^3 -> g/mm^3 : * (1000 g/kg) / (1e9 mm^3/m^3) = 1e-6
      const densityOut = density * 1e-6;
      const massOut = mass * 1000; // kg -> g
      const volOut = volume * 1e9; // m^3 -> mm^3
      const areaOut = surfaceArea * 1e6; // m^2 -> mm^2
      const comOut = {
        x: com.x * MM_PER_M,
        y: com.y * MM_PER_M,
        z: com.z * MM_PER_M,
      };
      return {
        file,
        unitSystem,
        density: densityOut,
        mass: massOut,
        volume: volOut,
        surfaceArea: areaOut,
        centerOfMass: comOut,
        units: {
          density: "g/mm3",
          mass: "g",
          volume: "mm3",
          surfaceArea: "mm2",
          centerOfMass: "mm",
        },
      };
    }
    case "cgs": {
      // kg/m^3 -> g/cm^3 : * (1000 g/kg) / (1e6 cm^3/m^3) = 0.001
      const densityOut = density * 0.001;
      const massOut = mass * 1000; // kg -> g
      const volOut = volume * 1e6; // m^3 -> cm^3
      const areaOut = surfaceArea * 1e4; // m^2 -> cm^2
      const comOut = {
        x: com.x * CM_PER_M,
        y: com.y * CM_PER_M,
        z: com.z * CM_PER_M,
      };
      return {
        file,
        unitSystem,
        density: densityOut,
        mass: massOut,
        volume: volOut,
        surfaceArea: areaOut,
        centerOfMass: comOut,
        units: {
          density: "g/cm3",
          mass: "g",
          volume: "cm3",
          surfaceArea: "cm2",
          centerOfMass: "cm",
        },
      };
    }
    case "ips": {
      // kg/m^3 -> lbm/in^3 : * (lb/kg) / (in^3/m^3)
      const IN3_PER_M3 = IN_PER_M ** 3; // 61023.7440947323...
      const densityOut = density * (LB_PER_KG / IN3_PER_M3);
      const massOut = mass * LB_PER_KG; // kg -> lbm
      const volOut = volume * IN3_PER_M3; // m^3 -> in^3
      const areaOut = surfaceArea * IN_PER_M ** 2; // m^2 -> in^2
      const comOut = {
        x: com.x * IN_PER_M,
        y: com.y * IN_PER_M,
        z: com.z * IN_PER_M,
      };
      return {
        file,
        unitSystem,
        density: densityOut,
        mass: massOut,
        volume: volOut,
        surfaceArea: areaOut,
        centerOfMass: comOut,
        units: {
          density: "lbm/in3",
          mass: "lbm",
          volume: "in3",
          surfaceArea: "in2",
          centerOfMass: "in",
        },
      };
    }
    default:
      // Should never hit (normalizeUnitSystem guards)
      return si;
  }
};
