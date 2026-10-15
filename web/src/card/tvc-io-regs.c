/* The TVC256k++ card's graphics and function registers. Ported from the card
 * firmware (https://github.com/dikdom/tvc256kplusplus,
 * sources/firmware/TVC-IO/TVC-IO-main-sys.c, MIT license, Vass Sandor):
 * initRegisterPointers(), the register part of irq_handler_slotn() and of
 * process_queue_cycle(). The firmware queues the register writes for its
 * other core; here they are processed at once, so a function call written to
 * REG_FUNCTION_EXECUTE has completed when the Z80 reads the register back.
 * The memory, drive, USB and SID registers are handled in tvc256kpp.cpp.
 * Changes for Ep128web: GPIO and PIO accesses removed, card_* interface. */
#include "card_shim.h"
#include "tvc-card.h"
#include "sprite.h"
#include "tvc-routines.h"

typedef enum {
    REG_SPRITE_X = 0x00,
    REG_SPRITE_Y = 0x20,
    REG_SPRITE_COLOR = 0x40,
    REG_SPRITE_PHASE = 0x50,
    REG_SPRITE_FOREGROUND = 0x60,
    REG_SPRITE_ENABLE = 0x70,
    REG_SPRITE_COLORMODE = 0x80,
    REG_SPRITE_ENABLE_LOW = 0x90,
    REG_SPRITE_ENABLE_HIGH,
    REG_SPRITE_FOREGROUND_LOW,
    REG_SPRITE_FOREGROUND_HIGH,
    REG_SPRITE_COLORMODE_LOW,
    REG_SPRITE_COLORMODE_HIGH,
    REG_SPRITE_SP_COLLISION_LOW,
    REG_SPRITE_SP_COLLISION_HIGH,
    REG_SPRITE_BG_COLLISION_LOW,
    REG_SPRITE_BG_COLLISION_HIGH,
    REG_SPRITE_SP_IRQMASK_LOW,
    REG_SPRITE_SP_IRQMASK_HIGH,
    REG_SPRITE_BG_IRQMASK_LOW,
    REG_SPRITE_BG_IRQMASK_HIGH,
    REG_SPRITE_BASE_ADDR,
    REG_SCREEN_VIDEOMODE = 0xA0,
    REG_SCREEN_SCREEN_BASE_ADDR,
    REG_SCREEN_SCREEN_COLOR_BASE_ADDR,
    REG_SCREEN_FONT_BASE_ADDR,
    REG_SCREEN_BITMAP_BASE_ADDR,
    REG_SCREEN_SCROLL_X,
    REG_SCREEN_SCROLL_Y,
    REG_SCREEN_BORDER_COLOR,
    REG_SCREEN_Y,
    REG_SCREEN_MAXY,
    REG_FUNCTION_EXECUTE = 0xC0,
    REG_FUNCTION_PARAM_START,
    REG_FUNCTION_RESULT,
    REG_FUNCTION_MULTI_EXECUTE = 0xC6,
    REG_FUNCTION_BITMAP_BASE
} tvcpp_register_t;

uint8_t currentP2 = 0x04;
uint8_t currentP3 = 0x05;

static uint8_t *register_pointer_storage_read[256];
static uint8_t *register_pointer_storage_write[256];

uint16_t registerSpriteEnabledRead;
uint16_t registerSpriteEnabledWrite;
uint16_t registerSpriteForegroundRead;
uint16_t registerSpriteForegroundWrite;
uint16_t registerSpriteColorModeRead;
uint16_t registerSpriteColorModeWrite;

volatile uint16_t registerSpSpCollision = 0;
volatile uint16_t registerSpBgCollision = 0;
volatile uint16_t registerSpSpIRQMask = 0;
volatile uint16_t registerSpBgIRQMask = 0;

uint8_t registerSpriteBaseAddress = 0;      // default sprites at 0x0000
uint8_t registerScreenBaseAddr = 1;         // default screen at 0x0400
uint8_t registerScreenColorBaseAddr = 2;    // default screen color at 0x0800
uint8_t registerFontBaseAddr = 2;           // default font at 0x1000
volatile uint8_t registerBitmapBaseAddr = 1;    // default bitmap at 0x8000

volatile uint8_t registerFunctionSelect = 0;
uint8_t registerFunctionParamStart = 0;
volatile uint8_t registerFunctionResult = 0;
uint8_t registerFunctionMultiSelect = 0;
uint8_t registerFunctionBitmapBase = 0xff;

/* no USB devices: copy_dir_to_psram() reports it */
uint8_t registerInitializedUSBDevices = 0;
uint8_t dsk_file_type = 0;

volatile bool card_int_active = false;

extern sprite_t sprites[];
extern volatile int8_t videoMode;
extern uint8_t screenScrollXreg;
extern uint8_t screenScrollYreg;
extern volatile uint8_t registerBorderColor;
extern uint16_t y;
extern volatile uint16_t maxY;
extern uint16_t screenMaxY;
extern tvc_function_struct_t tvc256k_funct_struct_array[];

extern uint8_t screenTextPosX;
extern uint8_t screenTextPosY;
extern uint8_t screenTextColor;
extern uint8_t penColor;
void init_graphics(void);
void card_gfx_power_on(void);
void card_gfx_reset(void);

static void initRegisterPointers(void) {
    memset(register_pointer_storage_read, 0, sizeof(register_pointer_storage_read));
    for(int i=0; i<SPRITES_NUM; i++) {
        register_pointer_storage_read[REG_SPRITE_X + i*2]  = (uint8_t *)&sprites[i].x;
        register_pointer_storage_read[REG_SPRITE_X + i*2+1] = ((uint8_t *)&sprites[i].x) + 1;
        register_pointer_storage_read[REG_SPRITE_Y + i*2]  = (uint8_t *)&sprites[i].y;
        register_pointer_storage_read[REG_SPRITE_Y + i*2 + 1] = ((uint8_t *)&sprites[i].y) + 1;
        register_pointer_storage_read[REG_SPRITE_COLOR + i] = (uint8_t *) &sprites[i].color;
        register_pointer_storage_read[REG_SPRITE_PHASE + i] = (uint8_t *) &sprites[i].phase;
        register_pointer_storage_read[REG_SPRITE_FOREGROUND + i] = (uint8_t *) &sprites[i].foreground;
        register_pointer_storage_read[REG_SPRITE_ENABLE + i] = (uint8_t *) &sprites[i].enabled;
        register_pointer_storage_read[REG_SPRITE_COLORMODE + i] = (uint8_t *) &sprites[i].fullColor;
    }

    register_pointer_storage_read[REG_SPRITE_ENABLE_LOW]       = (uint8_t *)&registerSpriteEnabledRead;
    register_pointer_storage_read[REG_SPRITE_ENABLE_HIGH]      = (uint8_t *)&registerSpriteEnabledRead + 1;
    register_pointer_storage_read[REG_SPRITE_FOREGROUND_LOW]   = (uint8_t *)&registerSpriteForegroundRead;
    register_pointer_storage_read[REG_SPRITE_FOREGROUND_HIGH]  = (uint8_t *)&registerSpriteForegroundRead + 1;
    register_pointer_storage_read[REG_SPRITE_COLORMODE_LOW]   = (uint8_t *)&registerSpriteColorModeRead;
    register_pointer_storage_read[REG_SPRITE_COLORMODE_HIGH]  = (uint8_t *)&registerSpriteColorModeRead + 1;

    register_pointer_storage_read[REG_SPRITE_SP_COLLISION_LOW] = (uint8_t *)&registerSpSpCollision;
    register_pointer_storage_read[REG_SPRITE_SP_COLLISION_HIGH] = (uint8_t *)&registerSpSpCollision + 1;
    register_pointer_storage_read[REG_SPRITE_SP_IRQMASK_LOW]      = (uint8_t *)&registerSpSpIRQMask;
    register_pointer_storage_read[REG_SPRITE_SP_IRQMASK_HIGH]     = (uint8_t *)&registerSpSpIRQMask + 1;
    register_pointer_storage_read[REG_SPRITE_BG_COLLISION_LOW] = (uint8_t *)&registerSpBgCollision;
    register_pointer_storage_read[REG_SPRITE_BG_COLLISION_HIGH] = (uint8_t *)&registerSpBgCollision + 1;
    register_pointer_storage_read[REG_SPRITE_BG_IRQMASK_LOW]      = (uint8_t *)&registerSpBgIRQMask;
    register_pointer_storage_read[REG_SPRITE_BG_IRQMASK_HIGH]     = (uint8_t *)&registerSpBgIRQMask + 1;

    register_pointer_storage_read[REG_SPRITE_BASE_ADDR]        = (uint8_t *)&registerSpriteBaseAddress;

    register_pointer_storage_read[REG_SCREEN_VIDEOMODE] = (uint8_t *)&videoMode;
    register_pointer_storage_read[REG_SCREEN_SCREEN_BASE_ADDR] = (uint8_t *)&registerScreenBaseAddr;
    register_pointer_storage_read[REG_SCREEN_SCREEN_COLOR_BASE_ADDR] = (uint8_t *)&registerScreenColorBaseAddr;
    register_pointer_storage_read[REG_SCREEN_FONT_BASE_ADDR] = (uint8_t *)&registerFontBaseAddr;
    register_pointer_storage_read[REG_SCREEN_BITMAP_BASE_ADDR] = (uint8_t *)&registerBitmapBaseAddr;
    register_pointer_storage_read[REG_SCREEN_SCROLL_X] = (uint8_t *)&screenScrollXreg;
    register_pointer_storage_read[REG_SCREEN_SCROLL_Y] = (uint8_t *)&screenScrollYreg;
    register_pointer_storage_read[REG_SCREEN_BORDER_COLOR] = (uint8_t *)&registerBorderColor;

    register_pointer_storage_read[REG_FUNCTION_EXECUTE] = (uint8_t *)&registerFunctionSelect;
    register_pointer_storage_read[REG_FUNCTION_PARAM_START] = &registerFunctionParamStart;
    register_pointer_storage_read[REG_FUNCTION_RESULT] = (uint8_t *)&registerFunctionResult;
    register_pointer_storage_read[REG_FUNCTION_MULTI_EXECUTE] = &registerFunctionMultiSelect;
    register_pointer_storage_read[REG_FUNCTION_BITMAP_BASE] = &registerFunctionBitmapBase;

    /* ------- READ/WRITE REGISTERS SO FAR ------------ */

    memcpy(register_pointer_storage_write, register_pointer_storage_read, sizeof(register_pointer_storage_write));

    /* ------- SEPARATED READ AND WRITE REGISTERS FROM HERE ------------ */

    register_pointer_storage_write[REG_SPRITE_ENABLE_LOW]       = (uint8_t *)&registerSpriteEnabledWrite;
    register_pointer_storage_write[REG_SPRITE_ENABLE_HIGH]      = (uint8_t *)&registerSpriteEnabledWrite + 1;
    register_pointer_storage_write[REG_SPRITE_FOREGROUND_LOW]   = (uint8_t *)&registerSpriteForegroundWrite;
    register_pointer_storage_write[REG_SPRITE_FOREGROUND_HIGH]  = (uint8_t *)&registerSpriteForegroundWrite + 1;
    register_pointer_storage_write[REG_SPRITE_COLORMODE_LOW]   = (uint8_t *)&registerSpriteColorModeWrite;
    register_pointer_storage_write[REG_SPRITE_COLORMODE_HIGH]  = (uint8_t *)&registerSpriteColorModeWrite + 1;

    register_pointer_storage_write[REG_SPRITE_SP_COLLISION_HIGH] = NULL;
    register_pointer_storage_write[REG_SPRITE_SP_COLLISION_LOW] = NULL;
    register_pointer_storage_write[REG_SPRITE_BG_COLLISION_LOW] = NULL;
    register_pointer_storage_write[REG_SPRITE_BG_COLLISION_HIGH] = NULL;

    register_pointer_storage_read[REG_SCREEN_Y] = (uint8_t *)&y;
    register_pointer_storage_read[REG_SCREEN_MAXY] = (uint8_t *)&screenMaxY;

    registerSpriteEnabledRead = 0;
    registerSpriteForegroundRead = 0;
    registerSpriteColorModeRead = 0;
    for(int i=0; i<SPRITES_NUM; i++) {
        if(sprites[i].enabled) {
            registerSpriteEnabledRead |= (1 << i);
        }
        if(sprites[i].foreground) {
            registerSpriteForegroundRead |= (1 << i);
        }
        if(sprites[i].fullColor) {
            registerSpriteColorModeRead |= (1 << i);
        }
    }
}

static uint8_t* getFunctionParamAddress(void) {
    uint32_t pos = 0;
    if(registerFunctionParamStart & 0x80) {
        if(currentP3 == 255) {
            return NULL;
        }
        pos = currentP3 * 16 * 1024 + (registerFunctionParamStart & 0x7f) * 128;
    } else {
        if(currentP2 == 255) {
            return NULL;
        }
        pos = currentP2 * 16 * 1024 + (registerFunctionParamStart) * 128;
    }
    return &TVC_RAM[pos];
}

/* the register value in the firmware's process_queue_cycle() */
static void processRegisterWrite(uint8_t registerSelect, uint8_t d) {
    uint8_t data = d;
    switch(registerSelect) {
        case REG_SPRITE_FOREGROUND:
            {
                uint16_t sum = 0;
                for(int i=0; i<SPRITES_NUM; i++) {
                    sprites[i].foreground = sprites[i].foreground > 0;
                    if(sprites[i].foreground)
                        sum |= (1<<i);
                }
                registerSpriteForegroundRead = sum;
            }
            break;
        case REG_SPRITE_ENABLE:
            {
                uint16_t sum = 0;
                for(int i=0; i<SPRITES_NUM; i++) {
                    sprites[i].enabled = sprites[i].enabled > 0;
                    if(sprites[i].enabled)
                        sum |= (1<<i);
                }
                registerSpriteEnabledRead = sum;
            }
            break;
        case REG_SPRITE_COLORMODE:
            {
                uint16_t sum = 0;
                for(int i=0; i<SPRITES_NUM; i++) {
                    sprites[i].fullColor = sprites[i].fullColor > 0;
                    if(sprites[i].fullColor)
                        sum |= (1<<i);
                }
                registerSpriteColorModeRead = sum;
            }
            break;
        case REG_SPRITE_ENABLE_LOW:
            for(int i=0; i<8; i++) {
                sprites[i].enabled = d & 0x01;
                d >>= 1;
            }
            *((uint8_t *)&registerSpriteEnabledRead) = data;
            break;
        case REG_SPRITE_ENABLE_HIGH:
            for(int i=8; i<16; i++) {
                sprites[i].enabled = d & 0x01;
                d >>= 1;
            }
            *((uint8_t *)&registerSpriteEnabledRead + 1) = data;
            break;
        case REG_SPRITE_FOREGROUND_LOW:
            for(int i=0; i<8; i++) {
                sprites[i].foreground = d & 0x01;
                d >>= 1;
            }
            *((uint8_t *)&registerSpriteForegroundRead) = data;
            break;
        case REG_SPRITE_FOREGROUND_HIGH:
            for(int i=8; i<16; i++) {
                sprites[i].foreground = d & 0x01;
                d >>= 1;
            }
            *((uint8_t *)&registerSpriteForegroundRead+1) = data;
            break;
        case REG_SPRITE_COLORMODE_LOW:
            for(int i=0; i<8; i++) {
                sprites[i].fullColor = (d & 1);
                d >>= 1;
            }
            *((uint8_t *)&registerSpriteColorModeRead) = data;
            break;
        case REG_SPRITE_COLORMODE_HIGH:
            for(int i=8; i<16; i++) {
                sprites[i].fullColor = (d & 1);
                d >>= 1;
            }
            *((uint8_t *)&registerSpriteColorModeRead+1) = data;
            break;
        case REG_SPRITE_BASE_ADDR:
            registerSpriteBaseAddress = d & 0x07;
            break;
        case REG_SCREEN_VIDEOMODE:
            videoMode = d & 0x03;
            break;
        case REG_SCREEN_SCREEN_BASE_ADDR:
            registerScreenBaseAddr = d & 0x7f;
            break;
        case REG_SCREEN_SCREEN_COLOR_BASE_ADDR:
            registerScreenColorBaseAddr = d & 0x7f;
            break;
        case REG_SCREEN_FONT_BASE_ADDR:
            registerFontBaseAddr = d & 0x3f;
            break;
        case REG_SCREEN_BITMAP_BASE_ADDR:
            registerBitmapBaseAddr = d & 0x03;
            break;
        case REG_SCREEN_SCROLL_X:
            screenScrollXreg &= 0x87;
            break;
        case REG_SCREEN_SCROLL_Y:
            screenScrollYreg &= 0x87;
            break;
        case REG_SCREEN_BORDER_COLOR:
            registerBorderColor &= 0x0f;
            break;
        case REG_SCREEN_MAXY:
            if((d<240) && (d>1)) {
                maxY = d + 21;
                screenMaxY = maxY - 21;
            }
            break;
        case REG_FUNCTION_EXECUTE:
            {
                uint8_t *functionParamAddress = getFunctionParamAddress();
                if(functionParamAddress && tvc256k_funct_struct_array[d].func) {
                    registerFunctionResult = tvc256k_funct_struct_array[d].func(functionParamAddress);
                } else {
                    registerFunctionResult = 0xff;
                }
                registerFunctionSelect = 255;
            }
            break;
        case REG_FUNCTION_MULTI_EXECUTE:
            {
                uint8_t *functionParamAddress = getFunctionParamAddress();
                if(functionParamAddress) {
                    uint8_t *functionParamAddressSave = functionParamAddress;
                    uint8_t numOfFunctions = d;
                    uint8_t result = 0;
                    registerFunctionResult = 0;
                    for(int i=0; i<numOfFunctions; i++) {
                        uint8_t functionCode = *functionParamAddress++;
                        uint8_t paramSize = getFunctionParamSize(functionParamAddress, tvc256k_funct_struct_array[functionCode].param_size);
                        if(!tvc256k_funct_struct_array[functionCode].func) {
                            registerFunctionResult = 0x80 + i + 1;
                            break;
                        }
                        result = tvc256k_funct_struct_array[functionCode].func((uint8_t *)functionParamAddress);
                        if( result ) {
                            *functionParamAddressSave = result;
                            registerFunctionResult = i + 1;
                            break;
                        }
                        functionParamAddress += paramSize;
                        /* Ep128web: the parameter list must stay in the card's
                         * RAM (the firmware does not check this) */
                        if(functionParamAddress >= TVC_RAM + TVC_RAM_SIZE) {
                            registerFunctionResult = 0x80 + i + 1;
                            break;
                        }
                    }
                    registerFunctionMultiSelect = 255;
                } else {
                    registerFunctionResult = 255;
                    registerFunctionMultiSelect = 255;
                }
            }
            break;
        case REG_FUNCTION_BITMAP_BASE:
            if(registerFunctionBitmapBase != 0xff)
                registerFunctionBitmapBase = d & 0x03;
            break;
        default:
            break;
    }
}

uint8_t card_reg_read(uint8_t r) {
    uint8_t data = 0;
    uint8_t *port_p = register_pointer_storage_read[r];
    if(port_p != NULL) {
        data = *port_p;
    }
    if(r == REG_SPRITE_SP_COLLISION_LOW) {
        registerSpSpCollision = 0;
        card_int_active = false;
    }
    if(r == REG_SPRITE_BG_COLLISION_LOW) {
        registerSpBgCollision = 0;
        card_int_active = false;
    }
    return data;
}

void card_reg_write(uint8_t r, uint8_t v) {
    uint8_t *regdata_p = register_pointer_storage_write[r];
    if(regdata_p != NULL) {
        *regdata_p = v;
    }
    if(r >= REG_SPRITE_ENABLE_LOW) {
        processRegisterWrite(r, v);
    } else if(r >= REG_SPRITE_FOREGROUND) {
        processRegisterWrite(r & 0xf0, v);
    }
}

void card_border_write(uint8_t data) {
    registerBorderColor =   // grb -> rgb
        ((data >> 1 ) & 0x01) | // 00000010 , b , >> 1
        ((data >> 1 ) & 0x04) | // 00001000 , r , >> 1
        ((data >> 4 ) & 0x02) | // 00100000 , g ,
        ((data >> 4 ) & 0x08);  // 10000000 , i
}

void card_power_on(void) {
    registerSpSpCollision = 0;
    registerSpBgCollision = 0;
    registerSpSpIRQMask = 0;
    registerSpBgIRQMask = 0;
    registerSpriteBaseAddress = 0;
    registerScreenBaseAddr = 1;
    registerScreenColorBaseAddr = 2;
    registerFontBaseAddr = 2;
    registerBitmapBaseAddr = 1;
    registerFunctionSelect = 0;
    registerFunctionParamStart = 0;
    registerFunctionResult = 0;
    registerFunctionMultiSelect = 0;
    registerFunctionBitmapBase = 0xff;
    card_int_active = false;
    screenMaxY = 240;
    maxY = 240 + 21;
    /* initial values of the tvc-routines.c globals (the firmware reboots) */
    screenTextPosX = 0;
    screenTextPosY = 0;
    screenTextColor = 0x0f;
    penColor = 0;
    /* the firmware's start-up order: pre_init(), main_graphics() */
    card_gfx_power_on();
    initRegisterPointers();
    init_routines();
}

void card_reset(void) {
    card_gfx_reset();
    /* reset_handler(): only the register copy is cleared, the SID emulation
     * keeps its volume until the next write (as on the card) */
    extern uint8_t SID[];
    SID[24] = 0;
}
