
export const defaultConf = {
    "name": "patrol",
    "id": 0,
    "port": 8001,
    "setting": {
        "log_prod_console": "info"
    },
    "drivers": {
        "mongo": {
            "host": "127.0.0.1",
            "port": 27017,
            "database": "patrol",
            "username": "",
            "password": ""
        },
        "discover/consul": {
            "optional": false,
            "health": {
                "api": "api/v1/core/health"
            },
            "did": {
                "head_refresh": "process"
            }
        }
    },
    "rules": {
       "mail_option": {
            "host": "smtp.exmail.qq.com",
            "port": 465,
            "secureConnection": true,
            "auth": {
                "user": "",
                "pass": ""
            }
        }
    }
};
