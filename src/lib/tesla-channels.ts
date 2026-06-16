// Tesla light show channel definitions — based on community-documented xLights channel layouts.
// Coordinate system: X = front (+) / rear (-), Y = up (+), Z = right (+) / left (-)
// 1 unit = 1 metre. Car centred at origin; road at Y = 0, car bottom at Y ≈ 0.10.

import type { TeslaModel, ShowStyle } from '@/lib/supabase'

export type LightType =
  | 'headlight' | 'highbeam' | 'drl' | 'fog'
  | 'turn_front' | 'turn_rear' | 'tail' | 'brake'
  | 'reverse' | 'plate' | 'interior' | 'strip'

export interface LightZone {
  id: string
  label: string
  channel: number                          // 0-indexed FSEQ channel
  position: [number, number, number]       // [x, y, z] metres
  color: number                            // Three.js 0xRRGGBB
  type: LightType
}

export interface CarProportions {
  bodyL: number; bodyW: number; bodyH: number
  cabinL: number; cabinW: number; cabinH: number
  cabinX: number
  roofStyle: 'fastback' | 'suv' | 'angular'
  truckBed?: { bedL: number; bedW: number; bedH: number; bedX: number }
}

export interface ModelDefinition {
  model: TeslaModel
  channelCount: number
  zones: LightZone[]
  proportions: CarProportions
}

// ─── Model 3 ──────────────────────────────────────────────────────────────────
const model3Zones: LightZone[] = [
  { id: 'fl_headlight', label: 'Front Left Headlight',   channel:  0, position: [ 2.345, 0.68, -0.70], color: 0xffffff, type: 'headlight'  },
  { id: 'fr_headlight', label: 'Front Right Headlight',  channel:  1, position: [ 2.345, 0.68,  0.70], color: 0xffffff, type: 'headlight'  },
  { id: 'fl_highbeam',  label: 'Front Left High Beam',   channel:  2, position: [ 2.345, 0.74, -0.55], color: 0xffffff, type: 'highbeam'   },
  { id: 'fr_highbeam',  label: 'Front Right High Beam',  channel:  3, position: [ 2.345, 0.74,  0.55], color: 0xffffff, type: 'highbeam'   },
  { id: 'fl_drl',       label: 'Front Left DRL',         channel:  4, position: [ 2.345, 0.80, -0.60], color: 0xe8e8ff, type: 'drl'        },
  { id: 'fr_drl',       label: 'Front Right DRL',        channel:  5, position: [ 2.345, 0.80,  0.60], color: 0xe8e8ff, type: 'drl'        },
  { id: 'fl_fog',       label: 'Front Left Fog',         channel:  6, position: [ 2.345, 0.28, -0.72], color: 0xffffcc, type: 'fog'        },
  { id: 'fr_fog',       label: 'Front Right Fog',        channel:  7, position: [ 2.345, 0.28,  0.72], color: 0xffffcc, type: 'fog'        },
  { id: 'fl_turn',      label: 'Front Left Turn Signal', channel:  8, position: [ 2.345, 0.65, -0.82], color: 0xff8c00, type: 'turn_front' },
  { id: 'fr_turn',      label: 'Front Right Turn Signal',channel:  9, position: [ 2.345, 0.65,  0.82], color: 0xff8c00, type: 'turn_front' },
  { id: 'rl_tail',      label: 'Rear Left Taillight',    channel: 10, position: [-2.345, 0.62, -0.70], color: 0xe8404a, type: 'tail'       },
  { id: 'rr_tail',      label: 'Rear Right Taillight',   channel: 11, position: [-2.345, 0.62,  0.70], color: 0xe8404a, type: 'tail'       },
  { id: 'rl_brake',     label: 'Rear Left Brake',        channel: 12, position: [-2.345, 0.68, -0.60], color: 0xff2020, type: 'brake'      },
  { id: 'rr_brake',     label: 'Rear Right Brake',       channel: 13, position: [-2.345, 0.68,  0.60], color: 0xff2020, type: 'brake'      },
  { id: 'rl_turn',      label: 'Rear Left Turn Signal',  channel: 14, position: [-2.345, 0.62, -0.82], color: 0xff8c00, type: 'turn_rear'  },
  { id: 'rr_turn',      label: 'Rear Right Turn Signal', channel: 15, position: [-2.345, 0.62,  0.82], color: 0xff8c00, type: 'turn_rear'  },
  { id: 'rl_reverse',   label: 'Rear Left Reverse',      channel: 16, position: [-2.345, 0.40, -0.65], color: 0xffffff, type: 'reverse'    },
  { id: 'rr_reverse',   label: 'Rear Right Reverse',     channel: 17, position: [-2.345, 0.40,  0.65], color: 0xffffff, type: 'reverse'    },
  { id: 'plate',        label: 'License Plate',          channel: 18, position: [-2.345, 0.38,  0.00], color: 0xffffff, type: 'plate'      },
  { id: 'int_front',    label: 'Interior Front Dome',    channel: 19, position: [ 0.30,  1.22,  0.00], color: 0xffeecc, type: 'interior'   },
  { id: 'int_rear',     label: 'Interior Rear Dome',     channel: 20, position: [-0.60,  1.22,  0.00], color: 0xffeecc, type: 'interior'   },
  { id: 'l_sill',       label: 'Left Sill Strip',        channel: 21, position: [ 0.00,  0.20, -0.93], color: 0xe8e8ff, type: 'strip'      },
  { id: 'r_sill',       label: 'Right Sill Strip',       channel: 22, position: [ 0.00,  0.20,  0.93], color: 0xe8e8ff, type: 'strip'      },
]

// ─── Model Y ──────────────────────────────────────────────────────────────────
const modelYZones: LightZone[] = [
  { id: 'fl_headlight', label: 'Front Left Headlight',    channel:  0, position: [ 2.375, 0.76, -0.74], color: 0xffffff, type: 'headlight'  },
  { id: 'fr_headlight', label: 'Front Right Headlight',   channel:  1, position: [ 2.375, 0.76,  0.74], color: 0xffffff, type: 'headlight'  },
  { id: 'fl_highbeam',  label: 'Front Left High Beam',    channel:  2, position: [ 2.375, 0.82, -0.59], color: 0xffffff, type: 'highbeam'   },
  { id: 'fr_highbeam',  label: 'Front Right High Beam',   channel:  3, position: [ 2.375, 0.82,  0.59], color: 0xffffff, type: 'highbeam'   },
  { id: 'fl_drl',       label: 'Front Left DRL',          channel:  4, position: [ 2.375, 0.88, -0.64], color: 0xe8e8ff, type: 'drl'        },
  { id: 'fr_drl',       label: 'Front Right DRL',         channel:  5, position: [ 2.375, 0.88,  0.64], color: 0xe8e8ff, type: 'drl'        },
  { id: 'fl_fog',       label: 'Front Left Fog',          channel:  6, position: [ 2.375, 0.30, -0.76], color: 0xffffcc, type: 'fog'        },
  { id: 'fr_fog',       label: 'Front Right Fog',         channel:  7, position: [ 2.375, 0.30,  0.76], color: 0xffffcc, type: 'fog'        },
  { id: 'fl_turn',      label: 'Front Left Turn Signal',  channel:  8, position: [ 2.375, 0.73, -0.86], color: 0xff8c00, type: 'turn_front' },
  { id: 'fr_turn',      label: 'Front Right Turn Signal', channel:  9, position: [ 2.375, 0.73,  0.86], color: 0xff8c00, type: 'turn_front' },
  { id: 'rl_tail',      label: 'Rear Left Taillight',     channel: 10, position: [-2.375, 0.70, -0.74], color: 0xe8404a, type: 'tail'       },
  { id: 'rr_tail',      label: 'Rear Right Taillight',    channel: 11, position: [-2.375, 0.70,  0.74], color: 0xe8404a, type: 'tail'       },
  { id: 'rl_brake',     label: 'Rear Left Brake',         channel: 12, position: [-2.375, 0.76, -0.64], color: 0xff2020, type: 'brake'      },
  { id: 'rr_brake',     label: 'Rear Right Brake',        channel: 13, position: [-2.375, 0.76,  0.64], color: 0xff2020, type: 'brake'      },
  { id: 'rl_turn',      label: 'Rear Left Turn Signal',   channel: 14, position: [-2.375, 0.70, -0.86], color: 0xff8c00, type: 'turn_rear'  },
  { id: 'rr_turn',      label: 'Rear Right Turn Signal',  channel: 15, position: [-2.375, 0.70,  0.86], color: 0xff8c00, type: 'turn_rear'  },
  { id: 'rl_reverse',   label: 'Rear Left Reverse',       channel: 16, position: [-2.375, 0.44, -0.69], color: 0xffffff, type: 'reverse'    },
  { id: 'rr_reverse',   label: 'Rear Right Reverse',      channel: 17, position: [-2.375, 0.44,  0.69], color: 0xffffff, type: 'reverse'    },
  { id: 'plate',        label: 'License Plate',           channel: 18, position: [-2.375, 0.42,  0.00], color: 0xffffff, type: 'plate'      },
  { id: 'int_front',    label: 'Interior Front Dome',     channel: 19, position: [ 0.30,  1.38,  0.00], color: 0xffeecc, type: 'interior'   },
  { id: 'int_rear',     label: 'Interior Rear Dome',      channel: 20, position: [-0.60,  1.38,  0.00], color: 0xffeecc, type: 'interior'   },
  { id: 'l_sill',       label: 'Left Sill Strip',         channel: 21, position: [ 0.00,  0.22, -0.97], color: 0xe8e8ff, type: 'strip'      },
  { id: 'r_sill',       label: 'Right Sill Strip',        channel: 22, position: [ 0.00,  0.22,  0.97], color: 0xe8e8ff, type: 'strip'      },
]

// ─── Model S ──────────────────────────────────────────────────────────────────
const modelSZones: LightZone[] = [
  { id: 'fl_headlight', label: 'Front Left Headlight',    channel:  0, position: [ 2.485, 0.68, -0.74], color: 0xffffff, type: 'headlight'  },
  { id: 'fr_headlight', label: 'Front Right Headlight',   channel:  1, position: [ 2.485, 0.68,  0.74], color: 0xffffff, type: 'headlight'  },
  { id: 'fl_highbeam',  label: 'Front Left High Beam',    channel:  2, position: [ 2.485, 0.74, -0.59], color: 0xffffff, type: 'highbeam'   },
  { id: 'fr_highbeam',  label: 'Front Right High Beam',   channel:  3, position: [ 2.485, 0.74,  0.59], color: 0xffffff, type: 'highbeam'   },
  { id: 'fl_drl',       label: 'Front Left DRL',          channel:  4, position: [ 2.485, 0.80, -0.64], color: 0xe8e8ff, type: 'drl'        },
  { id: 'fr_drl',       label: 'Front Right DRL',         channel:  5, position: [ 2.485, 0.80,  0.64], color: 0xe8e8ff, type: 'drl'        },
  { id: 'fl_fog',       label: 'Front Left Fog',          channel:  6, position: [ 2.485, 0.28, -0.76], color: 0xffffcc, type: 'fog'        },
  { id: 'fr_fog',       label: 'Front Right Fog',         channel:  7, position: [ 2.485, 0.28,  0.76], color: 0xffffcc, type: 'fog'        },
  { id: 'fl_turn',      label: 'Front Left Turn Signal',  channel:  8, position: [ 2.485, 0.65, -0.86], color: 0xff8c00, type: 'turn_front' },
  { id: 'fr_turn',      label: 'Front Right Turn Signal', channel:  9, position: [ 2.485, 0.65,  0.86], color: 0xff8c00, type: 'turn_front' },
  { id: 'rl_tail',      label: 'Rear Left Taillight',     channel: 10, position: [-2.485, 0.62, -0.74], color: 0xe8404a, type: 'tail'       },
  { id: 'rr_tail',      label: 'Rear Right Taillight',    channel: 11, position: [-2.485, 0.62,  0.74], color: 0xe8404a, type: 'tail'       },
  { id: 'rl_brake',     label: 'Rear Left Brake',         channel: 12, position: [-2.485, 0.68, -0.64], color: 0xff2020, type: 'brake'      },
  { id: 'rr_brake',     label: 'Rear Right Brake',        channel: 13, position: [-2.485, 0.68,  0.64], color: 0xff2020, type: 'brake'      },
  { id: 'rl_turn',      label: 'Rear Left Turn Signal',   channel: 14, position: [-2.485, 0.62, -0.86], color: 0xff8c00, type: 'turn_rear'  },
  { id: 'rr_turn',      label: 'Rear Right Turn Signal',  channel: 15, position: [-2.485, 0.62,  0.86], color: 0xff8c00, type: 'turn_rear'  },
  { id: 'rl_reverse',   label: 'Rear Left Reverse',       channel: 16, position: [-2.485, 0.40, -0.69], color: 0xffffff, type: 'reverse'    },
  { id: 'rr_reverse',   label: 'Rear Right Reverse',      channel: 17, position: [-2.485, 0.40,  0.69], color: 0xffffff, type: 'reverse'    },
  { id: 'plate',        label: 'License Plate',           channel: 18, position: [-2.485, 0.38,  0.00], color: 0xffffff, type: 'plate'      },
  { id: 'int_front',    label: 'Interior Front Dome',     channel: 19, position: [ 0.50,  1.22,  0.00], color: 0xffeecc, type: 'interior'   },
  { id: 'int_rear',     label: 'Interior Rear Dome',      channel: 20, position: [-0.70,  1.22,  0.00], color: 0xffeecc, type: 'interior'   },
  { id: 'rear_bar_l',   label: 'Rear Bar Left',           channel: 21, position: [-2.485, 0.72, -0.40], color: 0xe8404a, type: 'tail'       },
  { id: 'rear_bar_c',   label: 'Rear Bar Centre',         channel: 22, position: [-2.485, 0.72,  0.00], color: 0xe8404a, type: 'tail'       },
  { id: 'rear_bar_r',   label: 'Rear Bar Right',          channel: 23, position: [-2.485, 0.72,  0.40], color: 0xe8404a, type: 'tail'       },
  { id: 'l_sill',       label: 'Left Sill Strip',         channel: 24, position: [ 0.00,  0.20, -0.99], color: 0xe8e8ff, type: 'strip'      },
  { id: 'r_sill',       label: 'Right Sill Strip',        channel: 25, position: [ 0.00,  0.20,  0.99], color: 0xe8e8ff, type: 'strip'      },
]

// ─── Model X ──────────────────────────────────────────────────────────────────
const modelXZones: LightZone[] = [
  { id: 'fl_headlight',     label: 'Front Left Headlight',      channel:  0, position: [ 2.520, 0.74, -0.76], color: 0xffffff, type: 'headlight'  },
  { id: 'fr_headlight',     label: 'Front Right Headlight',     channel:  1, position: [ 2.520, 0.74,  0.76], color: 0xffffff, type: 'headlight'  },
  { id: 'fl_highbeam',      label: 'Front Left High Beam',      channel:  2, position: [ 2.520, 0.80, -0.61], color: 0xffffff, type: 'highbeam'   },
  { id: 'fr_highbeam',      label: 'Front Right High Beam',     channel:  3, position: [ 2.520, 0.80,  0.61], color: 0xffffff, type: 'highbeam'   },
  { id: 'fl_drl',           label: 'Front Left DRL',            channel:  4, position: [ 2.520, 0.86, -0.66], color: 0xe8e8ff, type: 'drl'        },
  { id: 'fr_drl',           label: 'Front Right DRL',           channel:  5, position: [ 2.520, 0.86,  0.66], color: 0xe8e8ff, type: 'drl'        },
  { id: 'fl_fog',           label: 'Front Left Fog',            channel:  6, position: [ 2.520, 0.30, -0.78], color: 0xffffcc, type: 'fog'        },
  { id: 'fr_fog',           label: 'Front Right Fog',           channel:  7, position: [ 2.520, 0.30,  0.78], color: 0xffffcc, type: 'fog'        },
  { id: 'fl_turn',          label: 'Front Left Turn Signal',    channel:  8, position: [ 2.520, 0.71, -0.88], color: 0xff8c00, type: 'turn_front' },
  { id: 'fr_turn',          label: 'Front Right Turn Signal',   channel:  9, position: [ 2.520, 0.71,  0.88], color: 0xff8c00, type: 'turn_front' },
  { id: 'rl_tail',          label: 'Rear Left Taillight',       channel: 10, position: [-2.520, 0.68, -0.76], color: 0xe8404a, type: 'tail'       },
  { id: 'rr_tail',          label: 'Rear Right Taillight',      channel: 11, position: [-2.520, 0.68,  0.76], color: 0xe8404a, type: 'tail'       },
  { id: 'rl_brake',         label: 'Rear Left Brake',           channel: 12, position: [-2.520, 0.74, -0.66], color: 0xff2020, type: 'brake'      },
  { id: 'rr_brake',         label: 'Rear Right Brake',          channel: 13, position: [-2.520, 0.74,  0.66], color: 0xff2020, type: 'brake'      },
  { id: 'rl_turn',          label: 'Rear Left Turn Signal',     channel: 14, position: [-2.520, 0.68, -0.88], color: 0xff8c00, type: 'turn_rear'  },
  { id: 'rr_turn',          label: 'Rear Right Turn Signal',    channel: 15, position: [-2.520, 0.68,  0.88], color: 0xff8c00, type: 'turn_rear'  },
  { id: 'rl_reverse',       label: 'Rear Left Reverse',         channel: 16, position: [-2.520, 0.44, -0.71], color: 0xffffff, type: 'reverse'    },
  { id: 'rr_reverse',       label: 'Rear Right Reverse',        channel: 17, position: [-2.520, 0.44,  0.71], color: 0xffffff, type: 'reverse'    },
  { id: 'plate',            label: 'License Plate',             channel: 18, position: [-2.520, 0.42,  0.00], color: 0xffffff, type: 'plate'      },
  { id: 'int_front',        label: 'Interior Front Dome',       channel: 19, position: [ 0.40,  1.44,  0.00], color: 0xffeecc, type: 'interior'   },
  { id: 'int_rear',         label: 'Interior Rear Dome',        channel: 20, position: [-0.55,  1.44,  0.00], color: 0xffeecc, type: 'interior'   },
  { id: 'falcon_l',         label: 'Falcon Wing Left Strip',    channel: 21, position: [ 0.15,  1.60, -0.78], color: 0xffeecc, type: 'interior'   },
  { id: 'falcon_r',         label: 'Falcon Wing Right Strip',   channel: 22, position: [ 0.15,  1.60,  0.78], color: 0xffeecc, type: 'interior'   },
  { id: 'l_sill',           label: 'Left Sill Strip',           channel: 23, position: [ 0.00,  0.22, -1.01], color: 0xe8e8ff, type: 'strip'      },
  { id: 'r_sill',           label: 'Right Sill Strip',          channel: 24, position: [ 0.00,  0.22,  1.01], color: 0xe8e8ff, type: 'strip'      },
  { id: 'rear_bar_l',       label: 'Rear Bar Left',             channel: 25, position: [-2.520, 0.78, -0.40], color: 0xe8404a, type: 'tail'       },
  { id: 'rear_bar_r',       label: 'Rear Bar Right',            channel: 26, position: [-2.520, 0.78,  0.40], color: 0xe8404a, type: 'tail'       },
]

// ─── Cybertruck ───────────────────────────────────────────────────────────────
const cybertruckZones: LightZone[] = [
  { id: 'front_bar_l',      label: 'Front LED Bar Left',        channel:  0, position: [ 2.840, 0.90, -0.80], color: 0xffffff, type: 'strip'      },
  { id: 'front_bar_cl',     label: 'Front LED Bar Centre-Left', channel:  1, position: [ 2.840, 0.90, -0.40], color: 0xffffff, type: 'strip'      },
  { id: 'front_bar_c',      label: 'Front LED Bar Centre',      channel:  2, position: [ 2.840, 0.90,  0.00], color: 0xffffff, type: 'strip'      },
  { id: 'front_bar_cr',     label: 'Front LED Bar Centre-Right',channel:  3, position: [ 2.840, 0.90,  0.40], color: 0xffffff, type: 'strip'      },
  { id: 'front_bar_r',      label: 'Front LED Bar Right',       channel:  4, position: [ 2.840, 0.90,  0.80], color: 0xffffff, type: 'strip'      },
  { id: 'fl_drl',           label: 'Front Left DRL',            channel:  5, position: [ 2.840, 0.96, -0.70], color: 0xe8e8ff, type: 'drl'        },
  { id: 'fr_drl',           label: 'Front Right DRL',           channel:  6, position: [ 2.840, 0.96,  0.70], color: 0xe8e8ff, type: 'drl'        },
  { id: 'fl_turn',          label: 'Front Left Turn Signal',    channel:  7, position: [ 2.840, 0.90, -0.94], color: 0xff8c00, type: 'turn_front' },
  { id: 'fr_turn',          label: 'Front Right Turn Signal',   channel:  8, position: [ 2.840, 0.90,  0.94], color: 0xff8c00, type: 'turn_front' },
  { id: 'fl_fog',           label: 'Front Left Fog',            channel:  9, position: [ 2.840, 0.32, -0.88], color: 0xffffcc, type: 'fog'        },
  { id: 'fr_fog',           label: 'Front Right Fog',           channel: 10, position: [ 2.840, 0.32,  0.88], color: 0xffffcc, type: 'fog'        },
  { id: 'rear_bar_l',       label: 'Rear LED Bar Left',         channel: 11, position: [-2.840, 0.90, -0.80], color: 0xe8404a, type: 'strip'      },
  { id: 'rear_bar_cl',      label: 'Rear LED Bar Centre-Left',  channel: 12, position: [-2.840, 0.90, -0.40], color: 0xe8404a, type: 'strip'      },
  { id: 'rear_bar_c',       label: 'Rear LED Bar Centre',       channel: 13, position: [-2.840, 0.90,  0.00], color: 0xe8404a, type: 'strip'      },
  { id: 'rear_bar_cr',      label: 'Rear LED Bar Centre-Right', channel: 14, position: [-2.840, 0.90,  0.40], color: 0xe8404a, type: 'strip'      },
  { id: 'rear_bar_r',       label: 'Rear LED Bar Right',        channel: 15, position: [-2.840, 0.90,  0.80], color: 0xe8404a, type: 'strip'      },
  { id: 'rl_brake',         label: 'Rear Left Brake',           channel: 16, position: [-2.840, 0.96, -0.70], color: 0xff2020, type: 'brake'      },
  { id: 'rr_brake',         label: 'Rear Right Brake',          channel: 17, position: [-2.840, 0.96,  0.70], color: 0xff2020, type: 'brake'      },
  { id: 'rl_turn',          label: 'Rear Left Turn Signal',     channel: 18, position: [-2.840, 0.90, -0.94], color: 0xff8c00, type: 'turn_rear'  },
  { id: 'rr_turn',          label: 'Rear Right Turn Signal',    channel: 19, position: [-2.840, 0.90,  0.94], color: 0xff8c00, type: 'turn_rear'  },
  { id: 'rl_reverse',       label: 'Rear Left Reverse',         channel: 20, position: [-2.840, 0.44, -0.80], color: 0xffffff, type: 'reverse'    },
  { id: 'rr_reverse',       label: 'Rear Right Reverse',        channel: 21, position: [-2.840, 0.44,  0.80], color: 0xffffff, type: 'reverse'    },
  { id: 'plate',            label: 'License Plate',             channel: 22, position: [-2.840, 0.40,  0.00], color: 0xffffff, type: 'plate'      },
  { id: 'int_front',        label: 'Interior Dome',             channel: 23, position: [ 0.80,  1.48,  0.00], color: 0xffeecc, type: 'interior'   },
  { id: 'bed_l',            label: 'Bed Left Strip',            channel: 24, position: [-1.14,  1.12, -0.94], color: 0xe8e8ff, type: 'strip'      },
  { id: 'bed_r',            label: 'Bed Right Strip',           channel: 25, position: [-1.14,  1.12,  0.94], color: 0xe8e8ff, type: 'strip'      },
  { id: 'under_f',          label: 'Undercarriage Front',       channel: 26, position: [ 1.50,  0.14,  0.00], color: 0xe8e8ff, type: 'strip'      },
  { id: 'under_r',          label: 'Undercarriage Rear',        channel: 27, position: [-1.50,  0.14,  0.00], color: 0xe8e8ff, type: 'strip'      },
]

// ─── Model registry ───────────────────────────────────────────────────────────
export const MODELS: Record<TeslaModel, ModelDefinition> = {
  model3: {
    model: 'model3', channelCount: 48, zones: model3Zones,
    proportions: { bodyL: 4.69, bodyW: 1.85, bodyH: 0.72, cabinL: 2.80, cabinW: 1.75, cabinH: 0.65, cabinX: -0.15, roofStyle: 'fastback' },
  },
  modelY: {
    model: 'modelY', channelCount: 48, zones: modelYZones,
    proportions: { bodyL: 4.75, bodyW: 1.92, bodyH: 0.82, cabinL: 2.90, cabinW: 1.82, cabinH: 0.72, cabinX: -0.10, roofStyle: 'suv' },
  },
  modelS: {
    model: 'modelS', channelCount: 48, zones: modelSZones,
    proportions: { bodyL: 4.97, bodyW: 1.96, bodyH: 0.72, cabinL: 3.10, cabinW: 1.86, cabinH: 0.65, cabinX: -0.20, roofStyle: 'fastback' },
  },
  modelX: {
    model: 'modelX', channelCount: 48, zones: modelXZones,
    proportions: { bodyL: 5.04, bodyW: 1.99, bodyH: 0.88, cabinL: 3.00, cabinW: 1.89, cabinH: 0.72, cabinX: -0.10, roofStyle: 'suv' },
  },
  cybertruck: {
    model: 'cybertruck', channelCount: 62, zones: cybertruckZones,
    proportions: {
      bodyL: 5.68, bodyW: 2.08, bodyH: 0.99, cabinL: 2.10, cabinW: 1.98, cabinH: 0.72, cabinX: 0.70,
      roofStyle: 'angular',
      truckBed: { bedL: 1.80, bedW: 2.00, bedH: 0.50, bedX: -1.14 },
    },
  },
}

// ─── Frame generator ──────────────────────────────────────────────────────────
export function generateFrames(
  style: ShowStyle,
  intensity: number,
  bpm: number,
  frames: number,
  modelDef: ModelDefinition,
): Uint8Array[] {
  const { channelCount, zones } = modelDef
  const scale = intensity / 100
  const beatsPerFrame = bpm / (60 * 20)   // assumes 20 fps

  return Array.from({ length: frames }, (_, f) => {
    const frame = new Uint8Array(channelCount)
    const t = f * beatsPerFrame

    zones.forEach((zone, zoneIdx) => {
      let brightness = 0

      // Type-based phase grouping so left/right sides can be driven together or independently
      const isLeft = zone.id.startsWith('fl_') || zone.id.startsWith('rl_') || zone.id.startsWith('l_') || zone.id.startsWith('falcon_l') || zone.id.startsWith('bed_l') || zone.id.startsWith('under')
      const sidePhase = isLeft ? 0 : 0.5   // offset right side for chase/wave effects

      switch (style) {
        case 'energetic':
          brightness = Math.sin(t * Math.PI * 2 + zoneIdx * 0.4) > 0.1 ? 1 : 0
          break
        case 'wave':
          brightness = Math.sin(t * Math.PI * 2 - zoneIdx * 0.35 + sidePhase) * 0.5 + 0.5
          break
        case 'strobe':
          // Front/rear alternate; interior stays off during strobe
          if (zone.type === 'interior') { brightness = 0; break }
          brightness = Math.floor(t * 2) % 2 === (zoneIdx % 2) ? 1 : 0
          break
        case 'chase':
          brightness = zoneIdx === Math.floor(t) % zones.length ? 1 : 0.03
          break
      }

      frame[zone.channel] = Math.round(Math.min(brightness * scale, 1) * 255)
    })

    return frame
  })
}

export function getChannelCount(model: TeslaModel): number {
  return MODELS[model].channelCount
}
